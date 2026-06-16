"""
External webhook receivers.

Currently:
  - `POST /api/v1/webhooks/livekit` — receives `room_finished` (and other)
    events from LiveKit Cloud. Used to mark the booking complete, record
    Decart spend, and trigger the post-call email to the bride.

LiveKit signs webhooks with the same API key / secret pair used to issue
room tokens (see livekit-api docs). The receiver verifies the
Authorization header — no separate webhook secret to configure.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import render_branded_email
from app.crud.crud_booking import crud_booking
from app.crud.crud_ai_job import crud_ai_job
from app.crud.crud_dress import crud_dress
from app.crud.crud_user import crud_user
from app.models.booking import Booking
from app.schemas.ai_job import AIJobCreate
from app.services import decart_budget
from app.services import job_runner
from app.services import notifications as notifications_service

try:
    from livekit import api as livekit_api
except Exception:  # pragma: no cover — server SDK is required in prod
    livekit_api = None


logger = logging.getLogger(__name__)
router = APIRouter()


# LiveKit room name is deterministic: `booking-{id}` (set in video_calls.py).
# Keep the parser anchored so a future "booking-room-…" rename doesn't
# silently match the wrong shape.
_ROOM_NAME_RE = re.compile(r"^booking-(\d+)$")


def _booking_id_from_room(room_name: Optional[str]) -> Optional[int]:
    if not room_name:
        return None
    match = _ROOM_NAME_RE.match(room_name)
    return int(match.group(1)) if match else None


def _format_duration(seconds: int) -> str:
    """`125` → `2m 5s`. Used in the completion email body."""
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if secs == 0:
        return f"{minutes}m"
    return f"{minutes}m {secs}s"


def _build_post_call_link(booking_id: int) -> Optional[str]:
    """Web deep-link a desktop bride can click straight from the email to
    pick her favorite. Returns None if no public URL is configured (RN-only
    deployments — the email omits the link and the RN app handles the flow
    via the booking_completed push)."""
    base = (settings.WEB_CALL_BASE_URL or "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/post-call/{booking_id}"


async def _send_completion_email_safe(
    bride_email: str,
    bride_name: str | None,
    booking_id: int,
    duration_seconds: int,
    post_call_link: str | None,
) -> None:
    """Email the bride that her session is ready for dress selection.

    Best-effort: never raises into the webhook handler. LiveKit retries
    failed webhook deliveries, so a transient email outage would otherwise
    trigger an infinite delivery loop with duplicated DB writes.
    """
    try:
        title = "Your fitting is complete"
        intro = (
            "Thanks for trying everything on. Now pick the one you loved most — "
            "you can checkout in a few taps from your phone."
        )
        details = f"Session length · {_format_duration(duration_seconds)}"
        paragraphs = [details]
        html = render_branded_email(
            preheader="Pick the dress you loved most.",
            title=title,
            intro=intro,
            paragraphs=paragraphs,
            cta_label="Open the app" if post_call_link else None,
            cta_url=post_call_link,
            footer_note=(
                "Open the Dress Live app on your phone — the post-call screen "
                "shows the dresses you just tried."
            ),
        )

        greeting = f"Hi {bride_name.split()[0] if bride_name else 'there'},\n\n"
        text_link = f"\n\nOpen the app: {post_call_link}\n" if post_call_link else "\n"
        text = (
            greeting
            + intro
            + text_link
            + f"\n{details}\n\n— The Dress Live team"
        )

        await send_email(
            to_email=bride_email,
            subject="Your virtual fitting is complete — pick your favorite dress",
            text=text,
            html=html,
        )
    except Exception as exc:  # pragma: no cover — log and swallow
        logger.warning("Completion email dispatch failed for booking %s: %s", booking_id, exc)


def _send_completion_push_safe(db: Session, booking: Booking) -> None:
    """Send a `booking_completed` push to the bride so the RN app can deep
    link to the post-call dress-selection screen. Existing notifications
    pipeline handles channel/category/sound defaults."""
    try:
        notifications_service.dispatch(
            db,
            user_id=booking.user_id,
            kind="booking_completed",
            title="Your fitting is complete",
            body="Tap to pick the dress you loved most.",
            action_type="booking",
            action_id=booking.id,
            payload={
                "booking_id": booking.id,
                "post_call": True,
            },
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("Completion push dispatch failed for booking %s: %s", booking.id, exc)


@router.post("/livekit", response_model=dict)
async def livekit_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(deps.get_db),
) -> Any:
    """Receive a LiveKit webhook event.

    Verification:
      Body is raw JSON. The Authorization header carries a JWT signed
      with our LiveKit API key/secret; `WebhookReceiver.receive()` both
      validates the signature and parses the protobuf event in one step.

    Events we act on:
      - `room_finished` — emitted ONCE per room, only after the room is
        empty (the consultant briefly disconnecting + rejoining will NOT
        trigger this; the room only "finishes" when no participants remain
        past the empty-timeout window). We:
          1. Resolve booking_id from `booking-{id}` room name.
          2. Mark booking `completed` (no-op if already completed —
             webhook is at-least-once).
          3. Record session seconds against the Decart budget tracker.
          4. Send the bride the post-call email + push.

    All other events are accepted with 200 OK and ignored so LiveKit's
    delivery dashboard stays clean.
    """
    if livekit_api is None or not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit is not configured on the server.")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing webhook signature.")

    raw_body = (await request.body()).decode("utf-8")
    receiver = livekit_api.WebhookReceiver(
        livekit_api.TokenVerifier(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    )

    try:
        event = receiver.receive(raw_body, authorization)
    except Exception as exc:
        # Don't leak verifier internals to the caller. Log + 401 means
        # LiveKit will retry, which is the right behavior for transient
        # clock-skew issues (TokenVerifier has a 60s leeway by default).
        logger.warning("LiveKit webhook signature rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature.") from exc

    event_name = (event.event or "").strip()
    room_name = event.room.name if event.HasField("room") else ""

    if event_name != "room_finished":
        # Accept-and-ignore: LiveKit will still log delivery success.
        logger.debug("LiveKit webhook ignored: event=%s room=%s", event_name, room_name)
        return {"ok": True, "ignored": event_name}

    booking_id = _booking_id_from_room(room_name)
    if booking_id is None:
        # Unknown room (e.g. a manually-created test room). Don't error —
        # LiveKit would just retry forever.
        logger.info("LiveKit room_finished for non-booking room: %s", room_name)
        return {"ok": True, "ignored": "non-booking-room"}

    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        logger.warning("LiveKit room_finished for unknown booking %s (room=%s)", booking_id, room_name)
        return {"ok": True, "ignored": "unknown-booking"}

    already_completed = booking.status == "completed"
    crud_booking.mark_session_completed(db, db_obj=booking)

    if already_completed:
        # Webhook retry from LiveKit. Don't re-send email/push or double-
        # count the Decart spend. mark_session_completed is itself a no-op
        # in this branch — we just return early.
        return {"ok": True, "duplicate": True, "booking_id": booking_id}

    # Compute session length from started_at → ended_at. If started_at is
    # missing (e.g. webhook arrives before the token endpoint ever ran —
    # shouldn't happen but worth handling), fall back to zero so we don't
    # crash. The Decart budget tracker treats 0 as a no-op spend.
    duration_seconds = 0
    if booking.started_at and booking.ended_at:
        delta = booking.ended_at - booking.started_at
        duration_seconds = max(0, int(delta.total_seconds()))

    if duration_seconds > 0:
        decart_budget.record_session_seconds(booking.id, duration_seconds)

    _send_completion_push_safe(db, booking)
    # Queue the completion email via FastAPI BackgroundTasks so a slow
    # Resend call can't make LiveKit time out and retry the webhook.
    # Previously used asyncio.create_task which got orphaned when the
    # webhook returned — the email frequently never sent.
    bride = crud_user.get(db, id=booking.user_id)
    if bride and bride.email:
        background_tasks.add_task(
            _send_completion_email_safe,
            bride.email,
            bride.full_name,
            booking.id,
            duration_seconds,
            _build_post_call_link(booking.id),
        )

    logger.info(
        "LiveKit room_finished: booking=%s duration=%ss spend=$%.4f",
        booking_id,
        duration_seconds,
        decart_budget.estimate_cost_usd(duration_seconds),
    )
    return {
        "ok": True,
        "booking_id": booking_id,
        "duration_seconds": duration_seconds,
    }


# ── AI pipeline provider webhooks ────────────────────────────────────────────
# fal.ai and FASHN call these when an async job finishes. Both follow the same
# contract as the LiveKit handler: best-effort, never raise into the provider
# (so it doesn't retry-storm), and an unknown job id returns 200-ignored rather
# than 500. The job is found by `provider_job_id`; status is recorded on the row.


async def _handle_provider_job_event(
    *,
    db: Session,
    provider: str,
    provider_job_id: Optional[str],
    status: str,
    result: Optional[dict],
    error: Optional[str],
) -> dict:
    if not provider_job_id:
        return {"ok": True, "ignored": "missing-provider-job-id"}

    job = crud_ai_job.get_by_provider_job_id(
        db, provider=provider, provider_job_id=provider_job_id
    )
    if job is None:
        # Stray or out-of-order webhook — don't 500, just ignore.
        return {"ok": True, "ignored": "unknown-job", "provider_job_id": provider_job_id}

    if job.status in ("completed", "failed"):
        # Idempotent: providers deliver at-least-once.
        return {"ok": True, "duplicate": True, "job_id": job.id}

    if status == "completed":
        crud_ai_job.mark_completed(db, db_obj=job, result=result or {})
        _on_job_completed(db, job=job)
    else:
        crud_ai_job.mark_failed(db, db_obj=job, error=error or "Provider reported failure.")
        _on_job_failed(db, job=job)

    logger.info(
        "Provider webhook: provider=%s job=%s status=%s", provider, job.id, status
    )
    return {"ok": True, "job_id": job.id, "status": job.status}


def _result_image_url(result: Optional[dict]) -> Optional[str]:
    """Pull the first output image URL from a provider result blob, tolerating
    the couple of shapes fal/FASHN use (`images:[{url}]` or `output:[url]`)."""
    if not result:
        return None
    images = result.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict):
            return first.get("url")
        if isinstance(first, str):
            return first
    output = result.get("output")
    if isinstance(output, list) and output:
        return output[0]
    if isinstance(output, str):
        return output
    return None


def _on_job_completed(db: Session, *, job) -> None:
    """Per-kind side effects when a job completes.

    - `standardize`: the catalog image is ready for boutique review → flip the
      dress to `ready`.
    - `tryon` (Approach A step 1): FASHN placed the dress → spawn the `editorial`
      step (the polish pass), chained via parent_job_id, and submit it.
    - `editorial` (Approach A step 2): the final image is ready → surface its URL
      onto the head tryon job's result so the polling client sees the finished
      image and a `final_image_url`.
    """
    if job.kind == "standardize" and job.dress_id:
        dress = crud_dress.get(db, id=job.dress_id)
        if dress is not None:
            dress.standardization_status = "ready"
            db.add(dress)
            db.commit()
        return

    if job.kind == "tryon":
        tryon_url = _result_image_url(job.result)
        if not tryon_url:
            logger.warning("tryon job %s completed with no output image", job.id)
            return
        # Approach A, simplified: FASHN tryon-max places the REAL dress on the
        # customer faithfully, so we use its output directly and skip the
        # generative editorial inpaint (which was reinventing the garment and
        # failing QA every time). Finishing = upscale + QA only. The head job is
        # still the polled job; _run_finishing_and_qa flips it to completed with
        # the final image.
        _run_finishing_and_qa(db, head=job, source_image_url=tryon_url)
        return


def _run_finishing_and_qa(db: Session, *, head, source_image_url: str) -> None:
    """Finishing chain run on the FASHN try-on output.

    upscale (Topaz, sync) -> QA (Gemini, sync) -> gate:
      pass             -> head.result.final_image_url = upscaled url; head completed
      fail & exhausted -> head.result.needs_review = true (human queue)

    `source_image_url` is the FASHN try-on image. Hero/marketing images
    (head.input.hero == true) always go to review even on pass. If keys are
    missing, upscale/QA are skipped and the try-on image is surfaced as-is.

    Note: with the generative editorial step removed there is no per-image
    "regenerate a different render" — a QA failure now means the FASHN try-on
    itself is off, so we route to human review rather than re-running an
    identical generation.
    """
    if head is None:
        return

    # 1) Upscale (sync; skipped gracefully if fal unconfigured).
    upscale = crud_ai_job.create(
        db,
        obj_in=AIJobCreate(
            kind="upscale",
            provider="fal",
            dress_id=head.dress_id,
            booking_id=head.booking_id,
            parent_job_id=head.id,
            input={"image_url": source_image_url},
        ),
    )
    upscale = job_runner.run_sync_job(db, job=upscale)
    final_url = _result_image_url(upscale.result) or source_image_url

    # 2) QA (sync) against the standardized garment reference.
    reference_url = None
    if head.dress_id:
        dress = crud_dress.get(db, id=head.dress_id)
        reference_url = getattr(dress, "standardized_image_url", None) if dress else None

    rubric = None
    qa_passed = True  # default-pass when QA can't run (no key / no reference)
    if reference_url:
        qa = crud_ai_job.create(
            db,
            obj_in=AIJobCreate(
                kind="qa",
                provider="gemini",
                dress_id=head.dress_id,
                booking_id=head.booking_id,
                parent_job_id=head.id,
                input={"image_url": final_url, "reference_url": reference_url},
            ),
        )
        qa = job_runner.run_sync_job(db, job=qa)
        if qa.status == "completed" and isinstance(qa.result, dict):
            rubric = qa.result
            from app.services import gemini as gemini_service

            qa_passed = gemini_service.passes(rubric)

    # 3) Gate. The job always completes with the best image we have; a QA failure
    # (or a hero image) flags it for human review rather than blocking the result.
    is_hero = bool((head.input or {}).get("hero", False))
    merged = dict(head.result or {})
    merged["final_image_url"] = final_url
    if rubric is not None:
        merged["qa"] = rubric
    if is_hero or not qa_passed:
        merged["needs_review"] = True
        head.needs_review = True
    crud_ai_job.mark_completed(db, db_obj=head, result=merged)
    db.add(head)
    db.commit()


def _on_job_failed(db: Session, *, job) -> None:
    """Per-kind side effects when a job fails. For `standardize`, drop the dress
    back to `none` so the boutique can retry from a clean state."""
    if job.kind == "standardize" and job.dress_id:
        dress = crud_dress.get(db, id=job.dress_id)
        if dress is not None and dress.standardization_status == "pending":
            dress.standardization_status = "none"
            db.add(dress)
            db.commit()


def _verify_webhook_secret(request: Request, *, expected: Optional[str], header: str) -> None:
    """Authenticate an inbound provider webhook against a shared secret.

    Fails CLOSED: if no secret is configured server-side, the webhook is rejected
    (401) rather than accepted unauthenticated — an open webhook lets anyone mark
    jobs completed with arbitrary image URLs. The secret is accepted either from a
    header or a `secret` query param, since fal/FASHN deliver it via the callback
    URL (they don't support custom request headers).
    """
    if not expected:
        raise HTTPException(
            status_code=401,
            detail="Webhook secret not configured on the server.",
        )
    provided = request.headers.get(header) or request.query_params.get("secret")
    # constant-time compare to avoid timing oracles
    import hmac

    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook secret.")


@router.post("/fal", response_model=dict)
async def fal_webhook(
    request: Request,
    db: Session = Depends(deps.get_db),
) -> dict:
    """Receive a fal.ai job-completion webhook.

    fal posts a JSON body with the request id and status/payload. The request is
    authenticated against FAL_WEBHOOK_SECRET (fails closed if unset). The exact
    fal payload field names are read defensively.
    """
    _verify_webhook_secret(
        request, expected=settings.FAL_WEBHOOK_SECRET, header="x-fal-webhook-secret"
    )

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    provider_job_id = body.get("request_id") or body.get("id")
    raw_status = (body.get("status") or "").upper()
    # fal uses OK/ERROR (and similar); map to our vocabulary.
    status = "completed" if raw_status in ("OK", "COMPLETED", "SUCCESS") else "failed"
    result = body.get("payload") or body.get("result")
    error = body.get("error")

    return await _handle_provider_job_event(
        db=db,
        provider="fal",
        provider_job_id=provider_job_id,
        status=status,
        result=result if isinstance(result, dict) else ({"output": result} if result else None),
        error=error if isinstance(error, str) else (str(error) if error else None),
    )


@router.post("/fashn", response_model=dict)
async def fashn_webhook(
    request: Request,
    db: Session = Depends(deps.get_db),
) -> dict:
    """Receive a FASHN async job webhook (used by the SP4 try-on step).

    Authenticated against FASHN_WEBHOOK_SECRET (fails closed if unset). FASHN
    reports `id` + `status` (`completed`/`failed`) and an `output` list.
    """
    _verify_webhook_secret(
        request, expected=settings.FASHN_WEBHOOK_SECRET, header="x-fashn-webhook-secret"
    )

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    provider_job_id = body.get("id")
    raw_status = (body.get("status") or "").lower()
    status = "completed" if raw_status == "completed" else "failed"
    output = body.get("output")
    error = body.get("error")

    return await _handle_provider_job_event(
        db=db,
        provider="fashn",
        provider_job_id=provider_job_id,
        status=status,
        result={"output": output} if output else None,
        error=error if isinstance(error, str) else (str(error) if error else None),
    )
