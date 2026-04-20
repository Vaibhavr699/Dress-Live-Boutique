from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.schemas.booking import BookingCreate, BookingUpdate


class CRUDBooking:
    def get(self, db: Session, id: int) -> Optional[Booking]:
        return db.query(Booking).filter(Booking.id == id).first()

    def get_multi_by_user(self, db: Session, *, user_id: int) -> List[Booking]:
        return (
            db.query(Booking)
            .filter(Booking.user_id == user_id)
            .order_by(Booking.created_at.desc())
            .all()
        )

    def get_multi_by_boutique(self, db: Session, *, boutique_id: int) -> List[Booking]:
        return (
            db.query(Booking)
            .filter(Booking.boutique_id == boutique_id)
            .order_by(Booking.created_at.desc())
            .all()
        )

    def create(self, db: Session, *, user_id: int, boutique_id: int, obj_in: BookingCreate) -> Booking:
        db_obj = Booking(
            user_id=user_id,
            boutique_id=boutique_id,
            appointment_type=obj_in.appointment_type,
            status="requested",
            scheduled_for=obj_in.scheduled_for,
            language=obj_in.language,
            notes=obj_in.notes,
            location=obj_in.location,
            selected_dress_ids=",".join(str(dress_id) for dress_id in obj_in.dress_ids),
            appointment_fee=obj_in.appointment_fee,
            is_paid=obj_in.is_paid,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, *, db_obj: Booking, obj_in: BookingUpdate) -> Booking:
        update_data = obj_in.model_dump(exclude_unset=True)
        for field in update_data:
            if hasattr(db_obj, field):
                setattr(db_obj, field, update_data[field])
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def set_video_ring(self, db: Session, *, db_obj: Booking, from_user_id: int) -> Booking:
        db_obj.video_ring_at = datetime.now(timezone.utc)
        db_obj.video_ring_from_user_id = from_user_id
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def clear_video_ring(self, db: Session, *, db_obj: Booking) -> Booking:
        db_obj.video_ring_at = None
        db_obj.video_ring_from_user_id = None
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


crud_booking = CRUDBooking()
