from datetime import datetime, timedelta, timezone
from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_booking import crud_booking
from app.crud.crud_user import crud_user
from app.models.booking import Booking
from app.models.user import User
from app.schemas.video_call import (
    IncomingVideoRing,
    IncomingVideoRingResponse,
    LiveKitTokenResponse,
    VideoRingBookingBody,
)

try:
    from livekit import api as livekit_api
except Exception:  # pragma: no cover
    livekit_api = None


router = APIRouter()

_RING_TTL = timedelta(minutes=5)


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

    return LiveKitTokenResponse(url=settings.LIVEKIT_URL, token=token, room=room, identity=identity)


@router.post("/ring", response_model=dict)
def ring_video_call(
    *,
    db: Session = Depends(deps.get_db),
    body: VideoRingBookingBody,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Notify the other party that this user is in (or starting) the video session."""
    booking = _assert_booking_video_participant(db, body.booking_id, current_user)
    crud_booking.set_video_ring(db, db_obj=booking, from_user_id=current_user.id)
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
