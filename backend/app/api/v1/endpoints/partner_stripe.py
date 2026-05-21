"""Partner-side Stripe Connect endpoints.

Lifecycle:
  - /connect-link (POST): lazily creates an Express acct_* if the boutique
    doesn't have one, then returns a single-use AccountLink for hosted
    onboarding. Partner opens this in expo-web-browser.
  - /status (GET): returns onboarded? charges_enabled? balance? — polled
    by the wallet UI after the user closes the webview to flip the CTA.
  - /dashboard-link (GET): one-time login URL to the partner's Express
    dashboard so they can manage payouts/bank details directly.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_boutique import crud_boutique
from app.models.user import User
from app.schemas.partner_stripe import (
    ConnectLinkResponse,
    ConnectStatusResponse,
    DashboardLinkResponse,
    SubscriptionCheckoutRequest,
    SubscriptionCheckoutResponse,
    SubscriptionStatusResponse,
)
from app.services import stripe_service


logger = logging.getLogger(__name__)
router = APIRouter()


def _require_partner_boutique(db: Session, current_user: User):
    if current_user.role != "partner" or not current_user.boutique_id:
        raise HTTPException(
            status_code=403,
            detail="Only partners with a linked boutique can manage Stripe.",
        )
    boutique = crud_boutique.get(db, id=current_user.boutique_id)
    if boutique is None:
        raise HTTPException(status_code=404, detail="Boutique not found.")
    return boutique


@router.post("/connect-link", response_model=ConnectLinkResponse)
async def create_connect_link(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique = _require_partner_boutique(db, current_user)
    try:
        # Self-heal an orphaned `stripe_account_id`. This happens when an
        # account was created against a different Stripe key/env (e.g.
        # the partner tapped Connect before Connect was enabled on the
        # dashboard, then we rotated keys, or the test/live mode changed).
        # Without this check, every retry just kept asking Stripe about
        # an account it couldn't see → 502 forever.
        if boutique.stripe_account_id:
            try:
                stripe_service.get_account_status(account_id=boutique.stripe_account_id)
            except stripe_service.StripeUpstreamError as exc:
                msg = str(exc).lower()
                # Stripe's "no such account" or "does not have access" responses
                # both indicate the cached id is unusable. Wipe + create fresh.
                if "no such account" in msg or "does not have access" in msg or "may have been revoked" in msg:
                    logger.warning(
                        "Boutique %s had orphaned stripe_account_id %s; resetting and recreating.",
                        boutique.id, boutique.stripe_account_id,
                    )
                    boutique.stripe_account_id = None
                    # Also clear any half-onboarded subscription pointers
                    # tied to the dead account — they would be just as orphaned.
                    boutique.stripe_customer_id = None
                    boutique.stripe_subscription_id = None
                    db.add(boutique)
                    db.commit()
                    db.refresh(boutique)
                # Any other Stripe error: surface as 502 below.
                else:
                    raise

        if not boutique.stripe_account_id:
            account_id = stripe_service.create_express_account(
                email=current_user.email, boutique_name=boutique.name
            )
            boutique.stripe_account_id = account_id
            db.add(boutique)
            db.commit()
            db.refresh(boutique)

        url, expires_at = stripe_service.create_onboarding_link(
            account_id=boutique.stripe_account_id
        )
    except stripe_service.StripeConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except stripe_service.StripeUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return ConnectLinkResponse(url=url, expires_at=expires_at)


@router.get("/status", response_model=ConnectStatusResponse)
async def get_connect_status(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique = _require_partner_boutique(db, current_user)
    if not boutique.stripe_account_id:
        return ConnectStatusResponse(onboarded=False)

    try:
        st = stripe_service.get_account_status(account_id=boutique.stripe_account_id)
    except stripe_service.StripeConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except stripe_service.StripeUpstreamError:
        # Don't block the UI on a transient Stripe blip — the partner can
        # retry. Surface as not-onboarded so they're nudged to reconnect.
        return ConnectStatusResponse(
            onboarded=False, stripe_account_id=boutique.stripe_account_id
        )

    avail = pending = 0
    if st.charges_enabled:
        try:
            avail, pending = stripe_service.get_balance_cents(
                account_id=boutique.stripe_account_id,
                currency=settings.STRIPE_CURRENCY,
            )
        except stripe_service.StripeUpstreamError:
            pass  # balance is optional — show 0 if Stripe is grumpy

    return ConnectStatusResponse(
        onboarded=st.details_submitted and st.charges_enabled,
        stripe_account_id=st.account_id,
        charges_enabled=st.charges_enabled,
        payouts_enabled=st.payouts_enabled,
        available_balance_cents=avail,
        pending_balance_cents=pending,
    )


@router.get("/dashboard-link", response_model=DashboardLinkResponse)
async def get_dashboard_link(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique = _require_partner_boutique(db, current_user)
    if not boutique.stripe_account_id:
        raise HTTPException(
            status_code=409,
            detail="Finish Stripe onboarding before opening the dashboard.",
        )
    try:
        url = stripe_service.create_dashboard_login_link(
            account_id=boutique.stripe_account_id
        )
    except stripe_service.StripeConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except stripe_service.StripeUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return DashboardLinkResponse(url=url)


# ── Subscription (Stripe Billing for partner plans) ─────────────────────


def _price_id_for(plan: str) -> str:
    if plan == "monthly":
        price = settings.STRIPE_PRICE_MONTHLY
    elif plan == "annual":
        price = settings.STRIPE_PRICE_ANNUAL
    else:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")
    if not price:
        raise HTTPException(
            status_code=500,
            detail=f"Stripe price not configured for plan '{plan}'. "
                   f"Set STRIPE_PRICE_{plan.upper()} on the server.",
        )
    return price


@router.post("/subscription/checkout", response_model=SubscriptionCheckoutResponse)
async def subscription_checkout(
    *,
    payload: SubscriptionCheckoutRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Mint the PaymentIntent client_secret the partner app needs to
    activate their plan via PaymentSheet.

    If the partner already has an `active` subscription, we 409 — they
    shouldn't be double-charged. If the previous subscription is
    `canceled` / `incomplete` / `past_due`, we start a fresh one (Stripe
    keeps the old sub on the customer for history)."""
    boutique = _require_partner_boutique(db, current_user)

    if boutique.subscription_status == "active":
        raise HTTPException(
            status_code=409,
            detail="This boutique already has an active subscription.",
        )

    price_id = _price_id_for(payload.plan)

    try:
        customer_id = stripe_service.ensure_customer(
            email=current_user.email,
            boutique_id=boutique.id,
            existing_customer_id=boutique.stripe_customer_id,
        )
        result = stripe_service.create_subscription(
            customer_id=customer_id,
            price_id=price_id,
            boutique_id=boutique.id,
            plan=payload.plan,
        )
    except stripe_service.StripeConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except stripe_service.StripeUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # Persist the in-flight subscription so a webhook arriving before our
    # response returns still has somewhere to write status. The webhook
    # handler upserts on stripe_subscription_id.
    boutique.stripe_customer_id = customer_id
    boutique.stripe_subscription_id = result.subscription_id
    boutique.subscription_status = "incomplete"
    boutique.subscription_plan = payload.plan
    db.add(boutique)
    db.commit()

    if not settings.STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_PUBLISHABLE_KEY is not configured on the server.",
        )

    return SubscriptionCheckoutResponse(
        subscription_id=result.subscription_id,
        client_secret=result.client_secret,
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        customer_id=customer_id,
        plan=payload.plan,
    )


@router.get("/subscription/status", response_model=SubscriptionStatusResponse)
async def subscription_status(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique = _require_partner_boutique(db, current_user)
    raw_status = boutique.subscription_status
    status: str = raw_status if raw_status in ("active", "past_due", "canceled", "incomplete") else "none"
    return SubscriptionStatusResponse(
        status=status,  # type: ignore[arg-type]
        plan=boutique.subscription_plan,  # type: ignore[arg-type]
        current_period_end=boutique.subscription_current_period_end,
        can_publish=(status == "active"),
    )
