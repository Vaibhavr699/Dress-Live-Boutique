from typing import Any, List, Optional
from urllib.parse import quote, unquote

import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_booking import crud_booking
from app.crud.crud_dress import crud_dress
from app.models.user import User
from app.schemas.booking import (
    BookingBoutiqueSummary,
    BookingCreate,
    BookingCustomerSummary,
    BookingDressSummary,
    BookingUpdate,
    BookingView,
)

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
    return serialize_booking(db, booking)


@router.put("/{booking_id}", response_model=BookingView)
def update_booking(
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

    booking = crud_booking.update(db, db_obj=booking, obj_in=booking_payload)
    return serialize_booking(db, booking)
