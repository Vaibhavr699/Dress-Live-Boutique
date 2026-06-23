from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class ConnectLinkResponse(BaseModel):
    """Hosted onboarding URL the partner opens in a webview/browser."""

    url: str
    expires_at: int  # unix seconds


class ConnectStatusResponse(BaseModel):
    onboarded: bool
    stripe_account_id: Optional[str] = None
    charges_enabled: bool = False
    payouts_enabled: bool = False
    # Available balance, all in EUR cents (already aggregated for the
    # default currency). UI converts to display format.
    available_balance_cents: int = 0
    pending_balance_cents: int = 0


class DashboardLinkResponse(BaseModel):
    url: str


# ── Subscription (Stripe Billing for partner plans) ─────────────────────


PlanId = Literal["monthly", "annual"]


class SubscriptionCheckoutRequest(BaseModel):
    plan: PlanId


class SubscriptionCheckoutResponse(BaseModel):
    """Everything the partner app needs to drive PaymentSheet for the
    first invoice — confirming this PaymentIntent activates the sub."""

    subscription_id: str
    client_secret: str
    publishable_key: str
    customer_id: str
    plan: PlanId


class SubscriptionStatusResponse(BaseModel):
    # `none` = never subscribed (vs Stripe's `incomplete` which means
    # they tried but the first invoice was never confirmed). UI uses
    # this to decide whether to send the partner to /subscribe again.
    status: Literal["none", "active", "past_due", "canceled", "incomplete"] = "none"
    plan: Optional[PlanId] = None
    current_period_end: Optional[datetime] = None
    can_publish: bool = False
