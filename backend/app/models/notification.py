from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Notification(Base):
    """
    Server-side notification row. Created by `notifications.dispatch()` for
    every push event so users have a persistent feed they can read after the
    push notification has been dismissed.
    """

    __tablename__ = "notification"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)

    # Free-form bag of fields the client may render (e.g. scheduledFor,
    # boutiqueName, dressId, etc.). Using JSONB keeps it queryable in pg.
    payload = Column(JSONB, nullable=True)

    # Deep-link target so a notification tap can navigate cleanly.
    action_type = Column(String, nullable=True)   # 'booking' | 'order' | ...
    action_id = Column(Integer, nullable=True)

    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    user = relationship("User")
