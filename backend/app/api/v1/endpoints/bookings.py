from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_booking import crud_booking
from app.crud.crud_dress import crud_dress
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingUpdate, BookingView

router = APIRouter()


def serialize_booking(booking) -> BookingView:
    dress_ids = [int(item) for item in booking.selected_dress_ids.split(",") if item]
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
    return [serialize_booking(booking) for booking in bookings]


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
    return [serialize_booking(booking) for booking in bookings]


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

    booking = crud_booking.create(
        db,
        user_id=current_user.id,
        boutique_id=dresses[0].boutique_id,
        obj_in=booking_in,
    )
    return serialize_booking(booking)


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

    if current_user.role == "partner":
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to update this booking.")
    elif booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to update this booking.")

    booking = crud_booking.update(db, db_obj=booking, obj_in=booking_in)
    return serialize_booking(booking)
