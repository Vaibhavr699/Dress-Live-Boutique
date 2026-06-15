from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel

# Job kinds and providers — kept as constants so callers and the dispatcher
# agree on the vocabulary.
JOB_KINDS = ("standardize", "tryon", "editorial", "upscale", "qa")
JOB_PROVIDERS = ("fal", "fashn")
JOB_STATUSES = ("pending", "submitted", "completed", "failed", "canceled")


class AIJobCreate(BaseModel):
    kind: str
    provider: str
    input: Dict[str, Any] = {}
    dress_id: Optional[int] = None
    booking_id: Optional[int] = None
    parent_job_id: Optional[int] = None


class AIJobRead(BaseModel):
    id: int
    kind: str
    provider: str
    status: str
    provider_job_id: Optional[str] = None
    input: Dict[str, Any] = {}
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    attempts: int
    dress_id: Optional[int] = None
    booking_id: Optional[int] = None
    parent_job_id: Optional[int] = None
    needs_review: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Typed per-kind input payloads (validated at the API boundary) ---


class StandardizeInput(BaseModel):
    """Input for a Step-1 standardization job (FLUX Kontext via fal)."""

    image_urls: list[str]
    prompt: Optional[str] = None
    swatch_url: Optional[str] = None
