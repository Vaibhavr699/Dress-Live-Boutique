from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# (PostCallDress / PostCallView are defined further down — they piggy-back
# on the existing BookingBoutiqueSummary.)


class BookingBase(BaseModel):
    appointment_type: Literal["video", "in_store"]
    scheduled_for: str
    language: str
    notes: Optional[str] = None
    location: Optional[str] = None
    appointment_fee: float = 0.0
    is_paid: bool = False


class BookingCreate(BookingBase):
    dress_ids: List[int]

    @field_validator("dress_ids")
    @classmethod
    def validate_dress_ids(cls, value: List[int]) -> List[int]:
        unique_ids = list(dict.fromkeys(value))
        if not unique_ids:
            raise ValueError("At least one dress must be selected.")
        if len(unique_ids) > 4:
            raise ValueError("A maximum of 4 dresses can be selected per booking.")
        return unique_ids


class BookingUpdate(BaseModel):
    status: Optional[Literal["requested", "accepted", "rejected", "rescheduled", "completed"]] = None
    scheduled_for: Optional[str] = None
    language: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    appointment_fee: Optional[float] = None
    is_paid: Optional[bool] = None


class Booking(BaseModel):
    id: int
    user_id: int
    boutique_id: int
    appointment_type: str
    status: str
    scheduled_for: str
    language: str
    notes: Optional[str] = None
    location: Optional[str] = None
    selected_dress_ids: str
    appointment_fee: float
    is_paid: bool
    video_ring_at: Optional[datetime] = None
    video_ring_from_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingCustomerSummary(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: EmailStr
    profile_image_url: Optional[str] = None


class BookingDressSummary(BaseModel):
    id: int
    name: str
    price: float
    colors: Optional[str] = None
    sizes: Optional[str] = None
    image_url: Optional[str] = None


class BookingBoutiqueSummary(BaseModel):
    id: int
    name: Optional[str] = None
    location: Optional[str] = None


class BookingView(Booking):
    dress_ids: List[int] = Field(default_factory=list)
    customer: Optional[BookingCustomerSummary] = None
    dresses: List[BookingDressSummary] = Field(default_factory=list)
    boutique: Optional[BookingBoutiqueSummary] = None

    @field_validator("dress_ids", mode="before")
    @classmethod
    def default_dress_ids(cls, value):
        return value or []


class PostCallDress(BaseModel):
    """Single dress option on the post-call selection screen. `image_url`
    is the catalogue photo (same as on the wishlist); `price` lets the
    UI show it without a second fetch before the bride taps Buy."""
    id: int
    name: str
    price: float
    image_url: Optional[str] = None
    colors: Optional[str] = None
    sizes: Optional[str] = None


class PostCallView(BaseModel):
    """Payload for the bride's post-call dress-selection screen.

    Returned by `GET /api/v1/bookings/{id}/post-call`. Includes booking
    timing (so the UI can show "Your fitting at Boutique X — 32 min")
    and the 4 dresses she tried. Tapping a dress hands off to the
    existing checkout flow (handled client-side; this endpoint does NOT
    create the order)."""
    booking_id: int
    status: str
    boutique: Optional[BookingBoutiqueSummary] = None
    scheduled_for: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    dresses: List[PostCallDress] = Field(default_factory=list)
