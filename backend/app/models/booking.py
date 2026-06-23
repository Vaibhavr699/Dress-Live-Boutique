from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Booking(Base):
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    boutique_id = Column(Integer, ForeignKey("boutique.id"), nullable=False, index=True)
    appointment_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="requested")
    scheduled_for = Column(String, nullable=False)
    language = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    selected_dress_ids = Column(Text, nullable=False)
    appointment_fee = Column(Float, nullable=False, default=0.0)
    is_paid = Column(Boolean, nullable=False, default=False)
    video_ring_at = Column(DateTime(timezone=True), nullable=True)
    video_ring_from_user_id = Column(Integer, ForeignKey("user.id"), nullable=True, index=True)
    # Video-call session timestamps. `started_at` is set when the first
    # LiveKit token is issued for the booking (whichever party joins first).
    # `ended_at` is set by the `/api/v1/webhooks/livekit` handler on the
    # `room_finished` event (fired only once the room is empty). The delta
    # between them is recorded against `decart_budget` for cost accounting.
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", foreign_keys=[user_id])
    video_ring_from_user = relationship("User", foreign_keys=[video_ring_from_user_id])
    boutique = relationship("Boutique")
