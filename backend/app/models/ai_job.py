from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class AIJob(Base):
    """A single asynchronous AI pipeline step (standardize / tryon / editorial /
    upscale / qa) running on an external provider (fal / fashn).

    One generic table backs the whole pipeline: the webhook receiver, the
    status-poll endpoint, and the retry logic are written once. Per-step request
    and response shapes live in the JSONB `input` / `result` columns; typed
    Pydantic schemas per `kind` enforce structure at the API boundary.

    Lifecycle: pending -> submitted -> completed | failed | canceled.
    `provider_job_id` is the opaque id returned by the provider and is how the
    webhook finds the row again.
    """

    __tablename__ = "aijob"

    id = Column(Integer, primary_key=True, index=True)
    # standardize | tryon | editorial | upscale | qa
    kind = Column(String, nullable=False, index=True)
    # fal | fashn
    provider = Column(String, nullable=False)
    # pending | submitted | completed | failed | canceled
    status = Column(String, nullable=False, server_default="pending", index=True)
    provider_job_id = Column(String, nullable=True, index=True)

    input = Column(JSONB, nullable=False, server_default="{}")
    result = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, server_default="0")

    dress_id = Column(
        Integer, ForeignKey("dress.id", ondelete="CASCADE"), nullable=True, index=True
    )
    booking_id = Column(
        Integer, ForeignKey("booking.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Links chained pipeline steps (e.g. tryon -> editorial in Approach A). The
    # head job (the one the app polls) has parent_job_id = NULL; downstream steps
    # point back at it.
    parent_job_id = Column(
        Integer, ForeignKey("aijob.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Set on a head job when QA fails after max regen attempts, or when it's a
    # hero/marketing image — both route to the human-review queue. Indexed so the
    # queue is a cheap filter.
    needs_review = Column(Boolean, nullable=False, server_default="false", index=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    dress = relationship("Dress")
    booking = relationship("Booking")
