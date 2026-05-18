import asyncio
import logging
from typing import Any, List, Optional
from urllib.parse import quote, unquote

import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.core.email import send_email
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_booking import crud_booking
from app.crud.crud_dress import crud_dress
from app.models.booking import Booking
from app.models.user import User
from app.schemas.booking import (
    BookingBoutiqueSummary,
    BookingCreate,
    BookingCustomerSummary,
    BookingDressSummary,
    BookingUpdate,
    BookingView,
    PostCallDress,
    PostCallView,
)
from app.services import notifications as notifications_service
from app.utils.email_join_token import mint_join_token

logger = logging.getLogger(__name__)


def _appointment_label(appointment_type: str) -> str:
    return "video call" if appointment_type == "video" else "store visit"


def _partner_user_ids_for_boutique(db: Session, boutique_id: int) -> list[int]:
    rows = (
        db.query(User.id)
        .filter(User.role == "partner", User.boutique_id == boutique_id)
        .all()
    )
    return [r[0] for r in rows]


def _notify_safe(db: Session, **kwargs) -> None:
    """Best-effort dispatch — never let a notification failure break a booking
    write. The endpoint commits before this is called."""
    try:
        notifications_service.dispatch(db, **kwargs)
    except Exception as e:
        logger.warning("notifications.dispatch failed: %s", e)


def _build_web_call_link(booking: Booking) -> Optional[str]:
    """Build the bride's tokenized join link for the Next.js web call
    page. Returns None when `WEB_CALL_BASE_URL` isn't configured (RN-only
    deployments) — callers must skip the email/section in that case."""
    base = (settings.WEB_CALL_BASE_URL or "").strip().rstrip("/")
    if not base:
        return None
    token = mint_join_token(booking_id=booking.id, user_id=booking.user_id)
    return f"{base}/call/{booking.id}?token={token}"


async def _send_video_call_confirmation_email_safe(
    db: Session, booking: Booking, boutique_name: str
) -> None:
    """Email the bride with the desktop call link when a video booking is
    accepted. No-op if she has no email on file, or if no web URL is set.
    Best-effort — bookings still succeed if Resend is down.
    """
    try:
        if booking.appointment_type != "video":
            return
        link = _build_web_call_link(booking)
        if not link:
            return
        bride = booking.user
        if bride is None or not bride.email:
            return

        body = (
            f"Hi,\n\n"
            f"Your virtual fitting with {boutique_name} is confirmed for "
            f"{booking.scheduled_for}.\n\n"
            "When it's time, open this link on a computer with a webcam "
            "(Chrome or Safari recommended):\n\n"
            f"{link}\n\n"
            "Tip: open it 1–2 minutes before the appointment so we can "
            "check your camera and mic. No login required — the link "
            "logs you in automatically.\n\n"
            "— The Dress Live team"
        )
        await send_email(
            to_email=bride.email,
            subject="Your virtual fitting is confirmed — your join link",
            text=body,
        )
    except Exception as exc:  # pragma: no cover — never break booking accept
        logger.warning(
            "video-call confirmation email failed for booking %s: %s",
            booking.id,
            exc,
        )


def _booking_payload(booking: Booking) -> dict[str, Any]:
    return {
        "booking_id": booking.id,
        "appointment_type": booking.appointment_type,
        "scheduled_for": booking.scheduled_for,
        "status": booking.status,
        "location": booking.location,
    }

router = APIRouter()


def _extract_storage_object_path(image_url: Optional[str]) -> Optional[str]:
    if not image_url or not settings.SUPABASE_URL:
        return None
    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if image_url.startswith(public_prefix):
        return unquote(image_url.replace(public_prefix, "", 1))
    return None


def _normalize_profile_image_url(image_url: Optional[str]) -> Optional[str]:
    """
    If a stored URL was built with a wrong SUPABASE_URL (e.g. postgresql://...),
    rewrite it to the correct HTTPS Supabase host when possible.
    """
    if not image_url or not settings.POSTGRES_SERVER.endswith(".supabase.co"):
        return image_url

    if image_url.startswith("postgres"):
        marker = "/storage/v1/"
        idx = image_url.find(marker)
        if idx != -1:
            base = f"https://{settings.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"
            return f"{base}{image_url[idx:]}"
    return image_url


def _sign_profile_image_url(image_url: Optional[str]) -> Optional[str]:
    """
    Return a signed URL for a Supabase storage object (works for private buckets).
    Falls back to the original URL if signing isn't possible.
    """
    image_url = _normalize_profile_image_url(image_url)

    if not image_url or not settings.SUPABASE_URL:
        return image_url
    # If the bucket is public, the stored public URL is already directly usable.
    # (Signing is only needed for private buckets.)
    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if image_url.startswith(public_prefix):
        return image_url

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        return image_url

    object_path = _extract_storage_object_path(image_url)
    if not object_path:
        return image_url

    encoded_path = quote(object_path, safe="/")
    sign_url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    try:
        response = httpx.post(
            sign_url,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={"expiresIn": 60 * 60 * 24 * 7},
            timeout=10.0,
        )
        if response.status_code not in (200, 201):
            return image_url
        data = response.json()
        signed_path = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
        if not signed_path:
            return image_url
        if isinstance(signed_path, str) and signed_path.startswith("http"):
            return signed_path
        # Supabase typically returns `/storage/v1/object/sign/...?...`
        # so we should prefix with the base URL only.
        if isinstance(signed_path, str) and signed_path.startswith("/"):
            return f"{settings.SUPABASE_URL}{signed_path}"
        return f"{settings.SUPABASE_URL}/{signed_path}"
    except Exception:
        return image_url


def serialize_booking(db: Session, booking) -> BookingView:
    dress_ids = [int(item) for item in booking.selected_dress_ids.split(",") if item]
    dresses = [crud_dress.get(db, id=dress_id) for dress_id in dress_ids]
    dresses = [dress for dress in dresses if dress]
    boutique = crud_boutique.get(db, id=booking.boutique_id)

    return BookingView(
        id=booking.id,
        user_id=booking.user_id,
        boutique_id=booking.boutique_id,
        appointment_type=booking.appointment_type,
        status=booking.status,
        scheduled_for=booking.scheduled_for,
        language=booking.language,
        notes=booking.notes,
        location=booking.location,
        selected_dress_ids=booking.selected_dress_ids,
        dress_ids=dress_ids,
        customer=BookingCustomerSummary(
            id=booking.user.id,
            full_name=booking.user.full_name,
            email=booking.user.email,
            profile_image_url=_sign_profile_image_url(booking.user.profile_image_url),
        ) if booking.user else None,
        dresses=[
            BookingDressSummary(
                id=dress.id,
                name=dress.name,
                price=dress.price,
                colors=dress.colors,
                sizes=dress.sizes,
                image_url=dress.image_url,
            )
            for dress in dresses
        ],
        boutique=BookingBoutiqueSummary(
            id=boutique.id,
            name=boutique.name,
            location=boutique.location,
        ) if boutique else None,
        appointment_fee=booking.appointment_fee,
        is_paid=booking.is_paid,
        video_ring_at=getattr(booking, "video_ring_at", None),
        video_ring_from_user_id=getattr(booking, "video_ring_from_user_id", None),
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


@router.get("/me", response_model=List[BookingView])
def read_my_bookings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    bookings = crud_booking.get_multi_by_user(db, user_id=current_user.id)
    return [serialize_booking(db, booking) for booking in bookings]


@router.get("/partner", response_model=List[BookingView])
def read_partner_bookings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can access partner bookings.")
    if not current_user.boutique_id:
        return []

    bookings = crud_booking.get_multi_by_boutique(db, boutique_id=current_user.boutique_id)
    return [serialize_booking(db, booking) for booking in bookings]


@router.get("/{booking_id}", response_model=BookingView)
def read_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if current_user.role == "buyer":
        if booking.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    elif current_user.role == "partner":
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    else:
        raise HTTPException(status_code=403, detail="Not allowed to view bookings.")

    return serialize_booking(db, booking)


@router.get("/{booking_id}/post-call", response_model=PostCallView)
def read_post_call(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Post-call dress-selection payload for the bride.

    Returned to the bride RN app (and later the web post-call screen)
    after the LiveKit `room_finished` webhook has marked the booking
    `completed`. Lists the 4 dresses she tried so she can tap one and
    hand off to the existing checkout flow.

    Buyer-only. Reachable when the booking is `completed` (the bride
    actually finished the call) OR `accepted` (so the screen can still
    render — useful when the bride opens the link before the webhook
    lands, especially in dev where webhooks may not be set up).
    """
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Not allowed.")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    if booking.appointment_type != "video":
        raise HTTPException(status_code=400, detail="This booking is not a video appointment.")

    dress_ids = [int(t) for t in (booking.selected_dress_ids or "").split(",") if t.strip().isdigit()]
    rows = {d.id: d for d in [crud_dress.get(db, id=d) for d in dress_ids] if d}
    dresses = [
        PostCallDress(
            id=rows[did].id,
            name=rows[did].name,
            price=rows[did].price,
            image_url=rows[did].image_url,
            colors=rows[did].colors,
            sizes=rows[did].sizes,
        )
        for did in dress_ids
        if did in rows
    ]

    boutique = crud_boutique.get(db, id=booking.boutique_id)
    duration_seconds: Optional[int] = None
    if booking.started_at and booking.ended_at:
        duration_seconds = max(0, int((booking.ended_at - booking.started_at).total_seconds()))

    return PostCallView(
        booking_id=booking.id,
        status=booking.status,
        boutique=BookingBoutiqueSummary(
            id=boutique.id, name=boutique.name, location=boutique.location
        ) if boutique else None,
        scheduled_for=booking.scheduled_for,
        started_at=booking.started_at,
        ended_at=booking.ended_at,
        duration_seconds=duration_seconds,
        dresses=dresses,
    )


@router.post("/", response_model=BookingView)
def create_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_in: BookingCreate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can create bookings.")

    dresses = []
    for dress_id in booking_in.dress_ids:
        dress = crud_dress.get(db, id=dress_id)
        if not dress:
            raise HTTPException(status_code=404, detail=f"Dress {dress_id} not found")
        dresses.append(dress)

    boutique_ids = {dress.boutique_id for dress in dresses}
    if len(boutique_ids) != 1:
        raise HTTPException(
            status_code=400,
            detail="All selected dresses must belong to the same boutique.",
        )

    boutique = crud_boutique.get(db, id=dresses[0].boutique_id)
    booking_payload = booking_in
    if booking_in.appointment_type == "in_store" and not booking_in.location:
        booking_payload = booking_in.model_copy(
            update={"location": boutique.location if boutique else "Boutique location to be confirmed"}
        )

    booking = crud_booking.create(
        db,
        user_id=current_user.id,
        boutique_id=dresses[0].boutique_id,
        obj_in=booking_payload,
    )

    # Notify all partners of this boutique that a new booking request landed.
    type_label = _appointment_label(booking.appointment_type)
    buyer_name = (current_user.full_name or current_user.email or "A customer").strip()
    boutique_name = (boutique.name if boutique else "your boutique") or "your boutique"
    buyer_image = (current_user.profile_image_url or "").strip() or None
    boutique_image = None
    if boutique:
        boutique_image = (boutique.header_image_url or boutique.interior_image_url or "").strip() or None

    for partner_id in _partner_user_ids_for_boutique(db, booking.boutique_id):
        _notify_safe(
            db,
            user_id=partner_id,
            kind="booking_request_received",
            title="New booking request",
            body=f"{buyer_name} requested a {type_label} for {booking.scheduled_for}.",
            action_type="booking",
            action_id=booking.id,
            payload=_booking_payload(booking),
            image_url=buyer_image,
        )

    # Also notify the buyer with a confirmation row so they have a paper trail.
    _notify_safe(
        db,
        user_id=current_user.id,
        kind="booking_requested",
        title="Booking request sent",
        body=f"Your {type_label} request to {boutique_name} is pending confirmation.",
        action_type="booking",
        action_id=booking.id,
        payload=_booking_payload(booking),
        image_url=boutique_image,
    )

    return serialize_booking(db, booking)


@router.put("/{booking_id}", response_model=BookingView)
async def update_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    booking_in: BookingUpdate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status in {"rejected", "completed"}:
        raise HTTPException(
            status_code=400,
            detail="This booking can no longer be updated.",
        )

    if current_user.role == "partner":
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to update this booking.")
        if booking_in.status and booking_in.status not in {"accepted", "rejected", "rescheduled", "completed"}:
            raise HTTPException(status_code=400, detail="Partners can only accept, reject, reschedule or complete bookings.")
    elif booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to update this booking.")
    else:
        if booking_in.status and booking_in.status not in {"rejected", "rescheduled", "completed"}:
            raise HTTPException(status_code=400, detail="Buyers can only cancel, reschedule, or complete their own bookings.")
        if booking_in.appointment_fee is not None or booking_in.is_paid is not None:
            raise HTTPException(status_code=400, detail="Buyers cannot update payment fields.")

    if booking_in.status == "rescheduled" and not booking_in.scheduled_for:
        raise HTTPException(
            status_code=400,
            detail="A new scheduled_for value is required when rescheduling a booking.",
        )

    booking_payload = booking_in
    if (
        current_user.role == "partner"
        and booking.appointment_type == "in_store"
        and booking_in.status == "rescheduled"
        and booking_in.location is None
    ):
        boutique = crud_boutique.get(db, id=booking.boutique_id)
        booking_payload = booking_in.model_copy(
            update={"location": booking.location or (boutique.location if boutique else None)}
        )

    prev_status = booking.status
    prev_scheduled_for = booking.scheduled_for
    booking = crud_booking.update(db, db_obj=booking, obj_in=booking_payload)

    # Notify the other party of status / schedule changes.
    status_changed = booking_in.status is not None and booking.status != prev_status
    schedule_changed = (
        booking_in.scheduled_for is not None and booking.scheduled_for != prev_scheduled_for
    )
    if status_changed or schedule_changed:
        type_label = _appointment_label(booking.appointment_type)
        acting_role = current_user.role  # 'partner' or 'buyer'
        buyer_id = booking.user_id
        partner_ids = _partner_user_ids_for_boutique(db, booking.boutique_id)
        # Recipients = "the other side"
        recipients: list[int] = []
        if acting_role == "partner":
            recipients = [buyer_id]
        else:
            recipients = list(partner_ids)

        # Pick a sensible title/body for the most common status transitions.
        if booking.status == "accepted":
            title = "Booking accepted"
            body = f"Your {type_label} is confirmed for {booking.scheduled_for}."
            kind = "booking_accepted"
        elif booking.status == "rejected":
            title = "Booking declined"
            body = f"Your {type_label} request was declined."
            kind = "booking_rejected"
        elif booking.status == "rescheduled":
            title = "Booking rescheduled"
            body = f"New time for your {type_label}: {booking.scheduled_for}."
            kind = "booking_rescheduled"
        elif booking.status == "completed":
            title = "Booking completed"
            body = f"Your {type_label} is marked complete."
            kind = "booking_completed"
        else:
            title = "Booking updated"
            body = f"Your {type_label} was updated. Check the latest details."
            kind = "booking_updated"

        # Rich image: show the *counterparty's* picture to the recipient.
        if acting_role == "partner":
            boutique = crud_boutique.get(db, id=booking.boutique_id)
            recipient_image = None
            if boutique:
                recipient_image = (boutique.header_image_url or boutique.interior_image_url or "").strip() or None
        else:
            recipient_image = (current_user.profile_image_url or "").strip() or None

        for uid in recipients:
            _notify_safe(
                db,
                user_id=uid,
                kind=kind,
                title=title,
                body=body,
                action_type="booking",
                action_id=booking.id,
                payload=_booking_payload(booking),
                image_url=recipient_image,
            )

    # When a partner accepts a VIDEO booking, fire off the bride's web
    # call link in a confirmation email. Background task so a Resend
    # hiccup can't block the API response.
    if (
        booking_in.status == "accepted"
        and prev_status != "accepted"
        and booking.appointment_type == "video"
        and current_user.role == "partner"
    ):
        boutique = crud_boutique.get(db, id=booking.boutique_id)
        boutique_name = (boutique.name if boutique else "your boutique") or "your boutique"
        asyncio.create_task(
            _send_video_call_confirmation_email_safe(db, booking, boutique_name)
        )

    return serialize_booking(db, booking)
