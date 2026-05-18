import logging
from datetime import datetime, timedelta, timezone
from typing import Any, List, Literal, Optional, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_booking import crud_booking
from app.crud.crud_user import crud_user
from app.models.booking import Booking
from app.models.dress import Dress
from app.models.user import User
from app.schemas.video_call import (
    DecartCredentials,
    DecartTokenResponse,
    IncomingVideoRing,
    IncomingVideoRingResponse,
    LiveKitTokenResponse,
    SessionDress,
    VideoRingBookingBody,
    WebJoinResponse,
)
from app.services import decart as decart_service
from app.services import decart_budget
from app.services import notifications as notifications_service
from app.utils.email_join_token import JoinTokenError, verify_join_token
from app.utils.scheduled_for import parse_scheduled_for

try:
    from livekit import api as livekit_api
except Exception:  # pragma: no cover
    livekit_api = None


logger = logging.getLogger(__name__)
router = APIRouter()

_RING_TTL = timedelta(minutes=5)

# How early either party may join a video booking. Both /ring and /token are
# gated on `scheduled_for - JOIN_WINDOW_BEFORE`. Bookings whose scheduled_for
# string can't be parsed fall through to the permissive path (we don't 500 on
# legacy data — see app/utils/scheduled_for.py).
JOIN_WINDOW_BEFORE = timedelta(minutes=5)


def _format_join_time(when: datetime) -> str:
    """User-friendly local-ish time for the 403 detail message."""
    return when.strftime("%a %d %b · %I:%M %p UTC").replace(" 0", " ").lstrip("0")


def _assert_join_window(booking: Booking) -> None:
    """Block calls that start more than JOIN_WINDOW_BEFORE before scheduled_for.

    DISABLED during testing — every booking is joinable any time. Re-enable by
    deleting the `return` line below; the parser + helpers stay in place so
    flipping it back on is a single-line change.
    """
    return  # noqa: temporary opt-out so testers can join calls outside the 5-min window

    # ── intentionally unreachable while gating is paused ─────────────────
    when = parse_scheduled_for(booking.scheduled_for)
    if when is None:
        return  # unparsable → don't block

    now = datetime.now(timezone.utc)
    unlock_at = when - JOIN_WINDOW_BEFORE
    if now < unlock_at:
        raise HTTPException(
            status_code=403,
            detail=f"Video call opens at {_format_join_time(unlock_at)} (5 min before the scheduled time).",
        )


def _other_party_user_id(db: Session, booking: Booking, current_user: User) -> Optional[int]:
    """Return the user id on the opposite side of this booking, or None."""
    if current_user.role == "buyer":
        # Resolve a partner user attached to the boutique.
        if not booking.boutique_id:
            return None
        partner = (
            db.query(User)
            .filter(User.boutique_id == booking.boutique_id, User.role == "partner")
            .first()
        )
        return partner.id if partner else None
    if current_user.role == "partner":
        return booking.user_id
    return None


def _assert_booking_video_participant(db: Session, booking_id: int, current_user: User):
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.appointment_type != "video":
        raise HTTPException(status_code=400, detail="This booking is not a video appointment.")
    if booking.status != "accepted":
        raise HTTPException(status_code=400, detail="Video ring is only available for accepted bookings.")
    if current_user.role == "buyer":
        if booking.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed for this booking.")
    elif current_user.role == "partner":
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed for this booking.")
    else:
        raise HTTPException(status_code=403, detail="Not allowed.")
    return booking


@router.get("/token", response_model=LiveKitTokenResponse)
def get_livekit_token(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Create a LiveKit access token for a booking-scoped room.

    Room name is deterministic: `booking-{booking_id}`.
    Buyer can only join their own booking room.
    Partner can only join rooms for bookings under their boutique.

    Both sides are gated on the booking's scheduled time: tokens are not
    issued more than `JOIN_WINDOW_BEFORE` ahead of `scheduled_for`. When a
    buyer successfully picks up a token, the partner gets a push so they
    know the customer has joined and is waiting.
    """
    if not settings.LIVEKIT_URL or not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit is not configured on the server.")
    if livekit_api is None:
        raise HTTPException(status_code=500, detail="LiveKit server SDK is not installed.")

    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if current_user.role == "buyer":
        if booking.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed to join this booking room.")
    elif current_user.role == "partner":
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to join this booking room.")
    else:
        raise HTTPException(status_code=403, detail="Not allowed to join booking rooms.")

    # Block tokens issued more than 5 min before the scheduled time.
    _assert_join_window(booking)

    room = f"booking-{booking_id}"
    identity = f"{current_user.role}-{current_user.id}"

    token = (
        livekit_api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(current_user.full_name or current_user.email or identity)
        .with_ttl(timedelta(minutes=max(5, settings.LIVEKIT_TOKEN_TTL_MINUTES)))
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=room,
            )
        )
        .to_jwt()
    )

    # First successful token issuance for this booking = session has begun.
    # Idempotent: subsequent joins leave `started_at` alone. This is the
    # signal the LiveKit `room_finished` webhook later subtracts from.
    crud_booking.mark_session_started(db, db_obj=booking)

    # When the buyer pulls a token, tell the partner the customer is waiting.
    # Best-effort — we never let a push failure block the token from being issued.
    if current_user.role == "buyer":
        partner_id = _other_party_user_id(db, booking, current_user)
        if partner_id is not None:
            buyer_name = (current_user.full_name or "").strip() or current_user.email or "Your customer"
            try:
                notifications_service.dispatch(
                    db,
                    user_id=partner_id,
                    kind="video_call_buyer_joined",
                    title="Customer is waiting",
                    body=f"{buyer_name} joined the video call and is waiting for you.",
                    action_type="video_call",
                    action_id=booking.id,
                    payload={
                        "booking_id": booking.id,
                        "scheduled_for": booking.scheduled_for,
                    },
                )
            except Exception as exc:  # pragma: no cover — never fail the call over a notif
                logger.warning("video_call_buyer_joined dispatch failed: %s", exc)

    return LiveKitTokenResponse(url=settings.LIVEKIT_URL, token=token, room=room, identity=identity)


@router.post("/ring", response_model=dict)
def ring_video_call(
    *,
    db: Session = Depends(deps.get_db),
    body: VideoRingBookingBody,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Notify the other party that this user is in (or starting) the video session.

    Sets the booking's ring marker (so the 30s poller on the other end picks it
    up) AND fires an immediate Expo push so the other party sees the call in
    their notification bar without waiting on the poll. Both ends are gated by
    `JOIN_WINDOW_BEFORE` against the booking's scheduled time.
    """
    booking = _assert_booking_video_participant(db, body.booking_id, current_user)
    _assert_join_window(booking)
    crud_booking.set_video_ring(db, db_obj=booking, from_user_id=current_user.id)

    target_user_id = _other_party_user_id(db, booking, current_user)
    if target_user_id is not None:
        caller_name = (current_user.full_name or "").strip() or current_user.email or "Someone"
        if current_user.role == "partner":
            title = "Your boutique is calling"
            body_text = f"{caller_name} is ready for your video fitting."
        else:
            title = "Customer is calling"
            body_text = f"{caller_name} is on the line for the video fitting."
        try:
            notifications_service.dispatch(
                db,
                user_id=target_user_id,
                kind="video_call_incoming",
                title=title,
                body=body_text,
                action_type="video_call",
                action_id=booking.id,
                payload={
                    "booking_id": booking.id,
                    "scheduled_for": booking.scheduled_for,
                    "caller_role": current_user.role,
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("video_call_incoming dispatch failed: %s", exc)

    return {"ok": True}


@router.post("/dismiss-ring", response_model=dict)
def dismiss_video_ring(
    *,
    db: Session = Depends(deps.get_db),
    body: VideoRingBookingBody,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Clear an incoming ring for this booking when the callee opens the call or dismisses the banner.
    Only clears if someone else rang (not clearing your own outgoing ring).
    """
    booking = _assert_booking_video_participant(db, body.booking_id, current_user)
    if booking.video_ring_from_user_id is None:
        return {"ok": True}
    if booking.video_ring_from_user_id == current_user.id:
        return {"ok": True}
    crud_booking.clear_video_ring(db, db_obj=booking)
    return {"ok": True}


@router.get("/incoming-ring", response_model=IncomingVideoRingResponse)
def get_incoming_video_ring(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Latest active ring for the current user from the other party on a shared video booking."""
    now = datetime.now(timezone.utc)
    threshold = now - _RING_TTL

    query = db.query(Booking).filter(
        Booking.appointment_type == "video",
        Booking.status == "accepted",
        Booking.video_ring_at.isnot(None),
        Booking.video_ring_at >= threshold,
        Booking.video_ring_from_user_id.isnot(None),
        Booking.video_ring_from_user_id != current_user.id,
    )

    if current_user.role == "buyer":
        query = query.filter(Booking.user_id == current_user.id)
    elif current_user.role == "partner":
        if not current_user.boutique_id:
            return IncomingVideoRingResponse(incoming=None)
        query = query.filter(Booking.boutique_id == current_user.boutique_id)
    else:
        return IncomingVideoRingResponse(incoming=None)

    booking = query.order_by(Booking.video_ring_at.desc()).first()
    if not booking or not booking.video_ring_from_user_id:
        return IncomingVideoRingResponse(incoming=None)

    caller = crud_user.get(db, id=booking.video_ring_from_user_id)
    if not caller or caller.role not in ("buyer", "partner"):
        return IncomingVideoRingResponse(incoming=None)

    name = (caller.full_name or "").strip() or caller.email or f"User {caller.id}"
    role = cast(Literal["buyer", "partner"], caller.role)
    return IncomingVideoRingResponse(
        incoming=IncomingVideoRing(
            booking_id=booking.id,
            caller_display_name=name,
            caller_role=role,
            scheduled_for=booking.scheduled_for,
            rung_at=booking.video_ring_at,
        )
    )


# ── Decart realtime VTON ────────────────────────────────────────────────

def _parse_selected_dress_ids(raw: Optional[str]) -> List[int]:
    """`Booking.selected_dress_ids` is stored as a comma-separated string
    (legacy schema). Parse it into a clean, de-duplicated, order-preserving
    list of ints. Silently skips garbage tokens — try-on must not 500 over
    a stray space."""
    if not raw:
        return []
    seen: set[int] = set()
    out: List[int] = []
    for token in str(raw).split(","):
        token = token.strip()
        if not token:
            continue
        try:
            dress_id = int(token)
        except ValueError:
            continue
        if dress_id in seen:
            continue
        seen.add(dress_id)
        out.append(dress_id)
    return out


def _build_dress_prompt(dress: Dress) -> str:
    """Compose the short text prompt Decart pairs with the reference
    image. Name alone is usually enough; description sharpens the result
    when present. Trimmed to a sensible length so we don't waste tokens
    on full marketing copy."""
    name = (dress.name or "").strip()
    desc = (dress.description or "").strip()
    if not name and not desc:
        return "wedding dress"
    if name and desc:
        text = f"{name} — {desc}"
    else:
        text = name or desc
    return text[:240]


def _load_session_dresses(db: Session, booking: Booking) -> List[SessionDress]:
    """Hydrate the dress IDs stored on the booking into the shape the
    bride client preloads + the consultant SDK references."""
    ids = _parse_selected_dress_ids(booking.selected_dress_ids)
    if not ids:
        return []

    rows = db.query(Dress).filter(Dress.id.in_(ids)).all()
    by_id = {d.id: d for d in rows}

    out: List[SessionDress] = []
    for did in ids:                                   # preserve booking order
        d = by_id.get(did)
        if d is None:                                 # dress deleted since booking
            continue
        out.append(SessionDress(
            id=d.id,
            name=d.name,
            image_url=d.image_url,
            prompt=_build_dress_prompt(d),
        ))
    return out


@router.get("/decart-token", response_model=DecartTokenResponse)
async def get_decart_client_token(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Mint a short-lived Decart realtime client token for a video booking.

    Buyer-only. The consultant's client never runs Decart — the bride
    renders the VTON output on her device and publishes it to LiveKit,
    so both parties see the same composited frame.

    Validations (defense in depth):
      - Caller is the booking's buyer.
      - Booking is a `video` appointment in `accepted` status.
      - Join window passes (`_assert_join_window` — currently disabled in
        the existing /token endpoint; whatever rule that helper enforces
        applies here too).
      - Decart budget guard allows a new session for this booking.

    Returns the `ek_*` short-lived token + the 4 selected dresses (with
    image URLs preloaded by the client before the call starts).
    """
    booking = _assert_booking_video_participant(db, booking_id, current_user)
    if current_user.role != "buyer":
        raise HTTPException(
            status_code=403,
            detail="Only the customer client runs the realtime try-on. "
                   "Consultants don't receive a Decart token.",
        )
    _assert_join_window(booking)

    decision = decart_budget.check_budget(booking_id=booking.id)
    if not decision.allowed:
        # 402 Payment Required communicates "budget exhausted" more
        # precisely than 503; the client should fall back to a Decart-less
        # plain video call rather than retry.
        raise HTTPException(status_code=402, detail=decision.reason or "Decart budget exhausted.")

    dresses = _load_session_dresses(db, booking)

    try:
        token = await decart_service.mint_client_token()
    except decart_service.DecartConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except decart_service.DecartUpstreamError as exc:
        logger.warning("Decart upstream error for booking %s: %s", booking.id, exc)
        raise HTTPException(
            status_code=502,
            detail="Realtime try-on provider is unavailable. The call can "
                   "still proceed without virtual try-on.",
        )

    return DecartTokenResponse(
        api_key=token.api_key,
        expires_at=token.expires_at,
        model=token.model,
        max_session_seconds=int(settings.DECART_MAX_SESSION_SECONDS),
        dresses=dresses,
    )


def _mint_livekit_token_for_booking(booking: Booking, user: User) -> LiveKitTokenResponse:
    """Shared LiveKit-token construction so `/token` and `/web-join` stay
    in sync. Identity carries role so consultant/bride map to distinct
    participants in the room."""
    if not settings.LIVEKIT_URL or not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit is not configured on the server.")
    if livekit_api is None:
        raise HTTPException(status_code=500, detail="LiveKit server SDK is not installed.")

    room = f"booking-{booking.id}"
    identity = f"{user.role}-{user.id}"
    token = (
        livekit_api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(user.full_name or user.email or identity)
        .with_ttl(timedelta(minutes=max(5, settings.LIVEKIT_TOKEN_TTL_MINUTES)))
        .with_grants(livekit_api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )
    return LiveKitTokenResponse(url=settings.LIVEKIT_URL, token=token, room=room, identity=identity)


@router.get("/web-join", response_model=WebJoinResponse)
async def web_join(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    token: str,
) -> Any:
    """Single endpoint the Next.js bride page hits with her email-link JWT.

    Returns everything she needs in one round-trip:
      - LiveKit credentials (joins the `booking-{id}` room)
      - Decart credentials  (opens the realtime VTON stream — only if
        the server has DECART_API_KEY set; web page falls back to plain
        video otherwise)
      - The 4 dresses (with image URLs to preload before "Join" becomes
        clickable)

    Auth: the join JWT is the ONLY auth — no Authorization header. The
    token is verified, the embedded `booking_id` is matched against the
    URL param, and the user_id is matched against the booking's buyer.
    A leaked-but-not-tampered token can only ever join the one booking
    it was minted for.

    On first call for a booking, `started_at` is stamped — same path as
    the RN `/token` endpoint, so the LiveKit `room_finished` webhook
    has a clean delta to compute Decart spend from.
    """
    try:
        claims = verify_join_token(token)
    except JoinTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if claims.booking_id != booking_id:
        # URL booking_id MUST match the token — otherwise a leaked token
        # for booking 7 could be used to peek at booking 8's dresses.
        raise HTTPException(status_code=401, detail="Token does not match booking.")

    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.appointment_type != "video":
        raise HTTPException(status_code=400, detail="This booking is not a video appointment.")
    if booking.status not in {"accepted", "rescheduled"}:
        raise HTTPException(
            status_code=400,
            detail="This appointment is not currently joinable.",
        )
    if booking.user_id != claims.user_id:
        raise HTTPException(status_code=403, detail="Token user does not match booking.")

    bride = crud_user.get(db, id=claims.user_id)
    if bride is None or bride.role != "buyer":
        raise HTTPException(status_code=403, detail="Token subject is not a buyer.")

    # Time-window gate — same helper the RN flow uses (currently disabled
    # via early return in `_assert_join_window`).
    _assert_join_window(booking)

    # LiveKit credentials first — never gated on Decart so the bride can
    # fall through to a plain video call if Decart is misconfigured.
    livekit_resp = _mint_livekit_token_for_booking(booking, bride)

    # Stamp started_at on first join (same as RN /token endpoint).
    crud_booking.mark_session_started(db, db_obj=booking)

    dresses = _load_session_dresses(db, booking)

    # Decart is optional — if the key isn't set or budget is exhausted,
    # the web page still gets LiveKit + dresses and can render a plain
    # video call without realtime try-on.
    decart_creds: Optional[DecartCredentials] = None
    if settings.DECART_API_KEY:
        decision = decart_budget.check_budget(booking_id=booking.id)
        if decision.allowed:
            try:
                allowed_origins = (
                    [settings.WEB_CALL_BASE_URL] if settings.WEB_CALL_BASE_URL else None
                )
                tok = await decart_service.mint_client_token(
                    allowed_origins=allowed_origins
                )
                decart_creds = DecartCredentials(
                    api_key=tok.api_key,
                    expires_at=tok.expires_at,
                    model=tok.model,
                    max_session_seconds=int(settings.DECART_MAX_SESSION_SECONDS),
                )
            except (decart_service.DecartConfigError, decart_service.DecartUpstreamError) as exc:
                # Log but do not 502 — the call should still proceed without
                # realtime try-on rather than blocking the bride entirely.
                logger.warning(
                    "Decart token mint failed for web-join booking %s: %s",
                    booking.id,
                    exc,
                )
        else:
            logger.info(
                "Decart budget refused web-join booking %s: %s",
                booking.id,
                decision.reason,
            )

    return WebJoinResponse(
        livekit=livekit_resp,
        decart=decart_creds,
        dresses=dresses,
        booking_id=booking.id,
        scheduled_for=booking.scheduled_for,
    )
