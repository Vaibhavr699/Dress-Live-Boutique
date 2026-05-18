from datetime import datetime
from typing import List, Literal, Optional

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


# ── Decart realtime VTON ─────────────────────────────────────────────────

class SessionDress(BaseModel):
    """One of the dresses selected for a video fitting. The bride/web client
    preloads `image_url` before the call so the first switch is instant; the
    consultant taps the dress to broadcast a SET_DRESS event over LiveKit
    data channel; the bride's Decart client then calls
    `realtimeClient.set({ image: image_url, prompt })` to apply it."""
    id: int
    name: str
    image_url: Optional[str] = None
    # `prompt` is a short text description Decart pairs with the reference
    # image (e.g. "elegant ivory A-line wedding gown"). Falls back to the
    # dress name when no dedicated prompt is configured.
    prompt: str


class DecartTokenResponse(BaseModel):
    """Returned to the bride (buyer) only. The consultant never gets a
    Decart token — only the bride's client runs the VTON pipeline."""
    api_key: str                    # short-lived `ek_*` token
    expires_at: datetime
    model: str                      # echoes lucy-2.1-vton
    max_session_seconds: int        # Decart-enforced session cap
    dresses: List[SessionDress]     # the 4 dresses selected for this booking


class DecartCredentials(BaseModel):
    """Decart half of a web-join response. Same fields as
    `DecartTokenResponse` minus the dresses (which the parent already
    carries) — flattened into the join payload."""
    api_key: str
    expires_at: datetime
    model: str
    max_session_seconds: int


class WebJoinResponse(BaseModel):
    """Single-shot bundle returned to the bride's Next.js call page in
    exchange for her email-link JWT. The web page makes ONE API call to
    `/video-calls/web-join` and has everything it needs:
      - LiveKit credentials → connect to the booking room
      - Decart credentials  → open the realtime VTON stream
      - The 4 dresses       → preload images before showing "Join"
    """
    livekit: LiveKitTokenResponse
    decart: Optional[DecartCredentials] = None   # None if Decart not configured
    dresses: List[SessionDress]
    booking_id: int
    scheduled_for: Optional[str] = None

