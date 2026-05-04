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
