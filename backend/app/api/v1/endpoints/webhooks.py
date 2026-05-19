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
from app.crud.crud_user import crud_user
from app.models.booking import Booking
from app.services import decart_budget
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
