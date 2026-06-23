from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class PushToken(Base):
    """
    Expo push token registered by a buyer or partner device.
    One row per (user_id, expo_token); same user can have many devices.
    """

    __tablename__ = "push_token"
    __table_args__ = (UniqueConstraint("user_id", "expo_token", name="uq_push_token_user_token"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    expo_token = Column(String, nullable=False, index=True)
    platform = Column(String, nullable=True)  # 'ios' | 'android' | 'web'
    device_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User")
