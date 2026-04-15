from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
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
        if booking_in.status and booking_in.status not in {"rejected", "rescheduled"}:
            raise HTTPException(status_code=400, detail="Buyers can only cancel or reschedule their own bookings.")
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
