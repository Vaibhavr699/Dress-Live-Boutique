"""Thin wrapper around the Stripe Python SDK so endpoint code never imports
stripe directly. Keeps secret-key access + error mapping in one place.

The connected-account model is Stripe Connect Express:
  - Each boutique gets its own `acct_*`.
  - Buyer pays the platform via a PaymentIntent with
    `transfer_data.destination=acct_*` and `application_fee_amount=<our cut>`,
    so Stripe handles the split automatically.
  - Partner's Express dashboard handles KYC + payouts; we just generate
    onboarding/dashboard links on demand.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import stripe

from app.core.config import settings


logger = logging.getLogger(__name__)


class StripeConfigError(RuntimeError):
    """Raised when an env var Stripe needs is missing on this deploy."""


class StripeUpstreamError(RuntimeError):
    """Raised when Stripe itself rejects the request (declined, network,
    etc.). Endpoint code translates to 402/502 as appropriate."""


def _ensure_configured() -> None:
    if not settings.STRIPE_SECRET_KEY:
        raise StripeConfigError(
            "STRIPE_SECRET_KEY is not set on the server. "
            "Add the test sk_test_… key in Railway → backend → Variables."
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY


# ── Connect (partner side) ───────────────────────────────────────────────


@dataclass(frozen=True)
class ConnectAccountStatus:
    account_id: str
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool


def create_express_account(*, email: Optional[str], boutique_name: str) -> str:
    """Create a fresh Express connected account for a boutique. Returns
    the new acct_* id; caller persists it on the Boutique row."""
    _ensure_configured()
    try:
        acct = stripe.Account.create(
            type="express",
            country="FR",  # Default to FR; partner can change during onboarding
            email=email,
            business_profile={"name": boutique_name},
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
        )
        return acct.id
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe account.create failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


def create_onboarding_link(*, account_id: str) -> tuple[str, int]:
    """Returns (url, expires_at). Single-use, ~5 minutes — generate fresh
    each tap of the partner's Connect button."""
    _ensure_configured()
    try:
        link = stripe.AccountLink.create(
            account=account_id,
            return_url=settings.STRIPE_CONNECT_RETURN_URL,
            refresh_url=settings.STRIPE_CONNECT_REFRESH_URL,
            type="account_onboarding",
        )
        return link.url, int(link.expires_at)
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe AccountLink.create failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


def create_dashboard_login_link(*, account_id: str) -> str:
    """One-time login URL to the partner's Express dashboard. Used by the
    'Withdraw' button — auto-payouts are usually on by default so manual
    intervention is rare, but the dashboard also shows the full ledger."""
    _ensure_configured()
    try:
        link = stripe.Account.create_login_link(account_id)
        return link.url
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe login_link failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


def get_account_status(*, account_id: str) -> ConnectAccountStatus:
    _ensure_configured()
    try:
        acct = stripe.Account.retrieve(account_id)
        return ConnectAccountStatus(
            account_id=acct.id,
            charges_enabled=bool(acct.charges_enabled),
            payouts_enabled=bool(acct.payouts_enabled),
            details_submitted=bool(acct.details_submitted),
        )
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe Account.retrieve failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


def get_balance_cents(*, account_id: str, currency: str = "eur") -> tuple[int, int]:
    """Returns (available_cents, pending_cents) for the given currency on
    the connected account. Stripe returns lists keyed by currency; we
    aggregate the matching entries."""
    _ensure_configured()
    try:
        bal = stripe.Balance.retrieve(stripe_account=account_id)
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe Balance.retrieve failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc

    cur = currency.lower()
    available = sum(int(b.amount) for b in bal.available if b.currency.lower() == cur)
    pending = sum(int(b.amount) for b in bal.pending if b.currency.lower() == cur)
    return available, pending


# ── Buyer side: PaymentIntent w/ destination charge ──────────────────────


@dataclass(frozen=True)
class PaymentIntentResult:
    id: str
    client_secret: str


def create_payment_intent(
    *,
    amount_cents: int,
    application_fee_cents: int,
    destination_account_id: str,
    currency: str = "eur",
    metadata: Optional[dict] = None,
) -> PaymentIntentResult:
    """Charge happens on the platform's account; funds (minus the
    application fee) are immediately transferred to the connected account.
    automatic_payment_methods=enabled lets Stripe's mobile SDK pick
    between card / Apple Pay / Google Pay on its own."""
    _ensure_configured()
    if amount_cents <= 0:
        raise StripeUpstreamError("amount_cents must be > 0")
    if application_fee_cents < 0 or application_fee_cents >= amount_cents:
        raise StripeUpstreamError(
            "application_fee_cents must be in [0, amount_cents)"
        )
    try:
        pi = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            application_fee_amount=application_fee_cents or None,
            transfer_data={"destination": destination_account_id},
            automatic_payment_methods={"enabled": True},
            metadata=metadata or {},
        )
        return PaymentIntentResult(id=pi.id, client_secret=pi.client_secret)
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe PaymentIntent.create failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


# ── Subscriptions (partner plans, Stripe Billing) ────────────────────────


@dataclass(frozen=True)
class SubscriptionResult:
    """Returned by create_subscription. The client_secret is for the
    first invoice's PaymentIntent — partner confirms it via PaymentSheet
    to activate the subscription."""
    subscription_id: str
    customer_id: str
    client_secret: str


def ensure_customer(*, email: Optional[str], boutique_id: int, existing_customer_id: Optional[str]) -> str:
    """Returns the cus_* id to use. Reuses the existing one if it's still
    valid on Stripe's side; otherwise creates a fresh Customer with the
    boutique_id embedded in metadata so we can correlate webhook events
    back to our row even if our DB lookup ever breaks."""
    _ensure_configured()
    if existing_customer_id:
        try:
            cust = stripe.Customer.retrieve(existing_customer_id)
            if not getattr(cust, "deleted", False):
                return cust.id
        except stripe.error.InvalidRequestError:  # type: ignore[attr-defined]
            # Customer was deleted from Stripe side — fall through and create a new one.
            pass
        except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
            logger.warning("Customer.retrieve failed, will create new: %s", exc)

    try:
        cust = stripe.Customer.create(
            email=email,
            metadata={"boutique_id": str(boutique_id)},
        )
        return cust.id
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Customer.create failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


def create_subscription(
    *,
    customer_id: str,
    price_id: str,
    boutique_id: int,
    plan: str,
) -> SubscriptionResult:
    """Open a Subscription with `payment_behavior=default_incomplete` so
    Stripe creates the first invoice and its PaymentIntent in `requires_payment_method`
    state — the partner confirms it via mobile PaymentSheet using the
    returned client_secret. On success Stripe flips the sub to `active`
    and fires customer.subscription.updated, which our webhook handler
    persists."""
    _ensure_configured()
    try:
        sub = stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
            payment_behavior="default_incomplete",
            payment_settings={"save_default_payment_method": "on_subscription"},
            expand=["latest_invoice.payment_intent"],
            metadata={"boutique_id": str(boutique_id), "plan": plan},
        )
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Subscription.create failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc

    latest_invoice = getattr(sub, "latest_invoice", None)
    payment_intent = getattr(latest_invoice, "payment_intent", None) if latest_invoice else None
    client_secret = getattr(payment_intent, "client_secret", None) if payment_intent else None
    if not client_secret:
        # Should never happen with default_incomplete + the invoice expand,
        # but raise loudly rather than handing the client an empty string.
        raise StripeUpstreamError(
            "Stripe did not return a client_secret for the first invoice."
        )
    return SubscriptionResult(
        subscription_id=sub.id,
        customer_id=customer_id,
        client_secret=client_secret,
    )


def cancel_subscription(*, subscription_id: str) -> None:
    _ensure_configured()
    try:
        stripe.Subscription.delete(subscription_id)
    except stripe.error.InvalidRequestError:  # type: ignore[attr-defined]
        # Already canceled / never existed — idempotent.
        pass
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.warning("Subscription.delete failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc


# ── Webhook signature verification ───────────────────────────────────────


def verify_webhook(*, payload: bytes, signature_header: str) -> dict:
    """Returns the parsed event dict, or raises StripeConfigError /
    StripeUpstreamError. Caller routes by event["type"]."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise StripeConfigError(
            "STRIPE_WEBHOOK_SECRET is not set. Register a webhook endpoint "
            "in the Stripe dashboard and paste the whsec_… value."
        )
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature_header,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
        return event
    except stripe.error.SignatureVerificationError as exc:  # type: ignore[attr-defined]
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise StripeUpstreamError("Invalid signature") from exc
    except Exception as exc:
        logger.warning("Stripe webhook parse failed: %s", exc)
        raise StripeUpstreamError(str(exc)) from exc
