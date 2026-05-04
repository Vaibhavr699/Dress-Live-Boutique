from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class LiveKitTokenResponse(BaseModel):
    url: str
    token: str
    room: str
    identity: str


class VideoRingBookingBody(BaseModel):
    booking_id: int = Field(..., ge=1)


class IncomingVideoRing(BaseModel):
    booking_id: int
    caller_display_name: str
    caller_role: Literal["buyer", "partner"]
    scheduled_for: Optional[str] = None
    rung_at: datetime


class IncomingVideoRingResponse(BaseModel):
    incoming: Optional[IncomingVideoRing] = None

