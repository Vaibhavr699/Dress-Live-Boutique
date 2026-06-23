from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class OrderItemIn(BaseModel):
    """What the buyer's cart sends up — just dress id + quantity. The
    backend looks up the dress to get its current price + name + image,
    so the buyer can't tamper with line totals."""

    dress_id: int
    quantity: int = Field(default=1, ge=1, le=20)


class OrderCreate(BaseModel):
    boutique_id: int
    items: List[OrderItemIn] = Field(..., min_length=1)


class OrderItemOut(BaseModel):
    id: int
    dress_id: Optional[int]
    name: str
    unit_price_cents: int
    quantity: int
    image_url: Optional[str] = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    user_id: int
    boutique_id: int
    status: str
    currency: str
    subtotal_cents: int
    service_fee_cents: int
    total_cents: int
    application_fee_cents: int
    stripe_payment_intent_id: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    items: List[OrderItemOut] = []

    model_config = {"from_attributes": True}


class OrderCreateResponse(BaseModel):
    """What the buyer app needs to actually run PaymentSheet."""

    order: OrderOut
    client_secret: str
    publishable_key: str
    # The Stripe-Connect connected account the PaymentIntent is destined for.
    # The mobile SDK uses it to scope Apple/Google Pay merchant capabilities.
    stripe_account_id: str
