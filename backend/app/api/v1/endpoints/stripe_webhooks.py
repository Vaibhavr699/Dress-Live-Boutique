"""Stripe webhook receiver.

Stripe always retries 5xx, never 4xx — so we return 200 even on logically
unhandled events (so retries stop) and only return 400 when the signature
fails (so attackers don't get free retries).

Handled events:
  - payment_intent.succeeded  → mark Order paid + notify partner
  - payment_intent.payment_failed / .canceled → mark Order canceled
  - charge.refunded → mark Order refunded
  - account.updated → no-op (status endpoint polls live)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.models.order import Order
from app.services import notifications, stripe_service


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(deps.get_db),
):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_service.verify_webhook(payload=payload, signature_header=sig)
    except stripe_service.StripeConfigError as exc:
        # Misconfig — log loudly but 200 so Stripe doesn't retry forever.
        logger.error("Stripe webhook config error: %s", exc)
        return {"received": True, "warning": "webhook secret missing"}
    except stripe_service.StripeUpstreamError as exc:
        # Bad signature → 400 so attackers can't probe.
        logger.warning("Stripe webhook signature failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    if event_type == "payment_intent.succeeded":
        _handle_pi_succeeded(db, obj)
    elif event_type in ("payment_intent.payment_failed", "payment_intent.canceled"):
        _handle_pi_failed(db, obj, event_type)
    elif event_type == "charge.refunded":
        _handle_refund(db, obj)
    elif event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
    ):
        _handle_subscription_upsert(db, obj)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(db, obj)
    elif event_type == "invoice.payment_failed":
        _handle_invoice_failed(db, obj)
    elif event_type == "invoice.paid":
        _handle_invoice_paid(db, obj)
    else:
        logger.info("Stripe webhook: ignoring event %s", event_type)

    return {"received": True}


def _find_order_by_pi(db: Session, pi_id: str) -> Order | None:
    return (
        db.query(Order)
        .filter(Order.stripe_payment_intent_id == pi_id)
        .first()
    )


def _handle_pi_succeeded(db: Session, pi: dict) -> None:
    pi_id = pi.get("id")
    if not pi_id:
        return
    order = _find_order_by_pi(db, pi_id)
    if order is None:
        logger.warning("payment_intent.succeeded for unknown PI %s", pi_id)
        return
    if order.status == "paid":
        return  # idempotent

    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)

    # Notify the partner. Look up any user belonging to the boutique with
    # role=partner. There can be multiple; everyone gets pinged.
    from app.models.user import User  # local import to avoid cycle
    partner_users = (
        db.query(User)
        .filter(User.boutique_id == order.boutique_id, User.role == "partner")
        .all()
    )
    eur = order.total_cents / 100.0
    for u in partner_users:
        try:
            notifications.dispatch(
                db,
                user_id=u.id,
                kind="order_paid",
                title="New order paid",
                body=f"€{eur:.2f} — order #{order.id}",
                action_type="order",
                action_id=order.id,
                payload={"order_id": order.id, "amount_cents": order.total_cents},
            )
        except Exception as exc:  # never let push failures break webhook
            logger.warning("Failed to notify partner %s of order %s: %s", u.id, order.id, exc)


def _handle_pi_failed(db: Session, pi: dict, event_type: str) -> None:
    pi_id = pi.get("id")
    if not pi_id:
        return
    order = _find_order_by_pi(db, pi_id)
    if order is None or order.status in ("paid", "refunded", "canceled"):
        return
    order.status = "canceled"
    db.add(order)
    db.commit()
    logger.info("Order %s set to canceled (%s)", order.id, event_type)


def _handle_refund(db: Session, charge: dict) -> None:
    pi_id = charge.get("payment_intent")
    if not pi_id:
        return
    order = _find_order_by_pi(db, pi_id)
    if order is None or order.status == "refunded":
        return
    order.status = "refunded"
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info("Order %s set to refunded", order.id)

    # Tell the buyer their money's coming back. Silent refunds generate
    # support tickets ("why was I charged again? oh wait, I see a
    # reversal on my statement — but where's the order?"). The amount
    # Stripe actually refunded can be partial; prefer the webhook
    # `amount_refunded` field when present, else fall back to the full
    # order total.
    refunded_cents = int(charge.get("amount_refunded") or order.total_cents)
    refunded_eur = refunded_cents / 100.0
    try:
        notifications.dispatch(
            db,
            user_id=order.user_id,
            kind="order_refunded",
            title="Refund processed",
            body=f"€{refunded_eur:.2f} for order #{order.id} is on its way back to your card.",
            action_type="order",
            action_id=order.id,
            payload={"order_id": order.id, "amount_cents": refunded_cents},
        )
    except Exception as exc:
        logger.warning(
            "Failed to notify buyer %s of refund on order %s: %s",
            order.user_id,
            order.id,
            exc,
        )


# ── Subscription event handlers (Stripe Billing for partners) ────────────


def _find_boutique_by_subscription_id(db: Session, sub_id: str):
    from app.models.boutique import Boutique
    return db.query(Boutique).filter(Boutique.stripe_subscription_id == sub_id).first()


def _find_boutique_by_customer_id(db: Session, customer_id: str):
    from app.models.boutique import Boutique
    return db.query(Boutique).filter(Boutique.stripe_customer_id == customer_id).first()


def _resolve_boutique_for_subscription_event(db: Session, sub: dict):
    """Find the boutique row this subscription belongs to. Tries sub id
    first (set by /subscription/checkout), then customer id, then the
    metadata.boutique_id we embed on every Subscription we create."""
    boutique = _find_boutique_by_subscription_id(db, sub.get("id") or "")
    if boutique is not None:
        return boutique
    cust_id = sub.get("customer")
    if cust_id:
        boutique = _find_boutique_by_customer_id(db, cust_id)
        if boutique is not None:
            return boutique
    boutique_id_meta = (sub.get("metadata") or {}).get("boutique_id")
    if boutique_id_meta:
        try:
            from app.models.boutique import Boutique
            return db.query(Boutique).filter(Boutique.id == int(boutique_id_meta)).first()
        except (ValueError, TypeError):
            return None
    return None


def _handle_subscription_upsert(db: Session, sub: dict) -> None:
    boutique = _resolve_boutique_for_subscription_event(db, sub)
    if boutique is None:
        logger.warning("subscription.updated for unknown boutique (sub %s)", sub.get("id"))
        return

    new_status = sub.get("status") or "incomplete"
    # Stripe's "trialing" is functionally active for our gating purposes;
    # collapse it so the UI only deals with one positive state.
    if new_status == "trialing":
        new_status = "active"

    # Plan id comes from the items array. We only ever attach one item
    # per sub, but Stripe still returns a list.
    plan_meta = (sub.get("metadata") or {}).get("plan")
    if plan_meta in ("monthly", "annual"):
        boutique.subscription_plan = plan_meta

    cust_id = sub.get("customer")
    if cust_id:
        boutique.stripe_customer_id = cust_id

    sub_id = sub.get("id")
    if sub_id:
        boutique.stripe_subscription_id = sub_id

    boutique.subscription_status = new_status

    period_end = sub.get("current_period_end")
    if isinstance(period_end, (int, float)):
        from datetime import datetime, timezone
        boutique.subscription_current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)

    db.add(boutique)
    db.commit()
    logger.info("Boutique %s subscription → %s", boutique.id, new_status)


def _handle_subscription_deleted(db: Session, sub: dict) -> None:
    boutique = _resolve_boutique_for_subscription_event(db, sub)
    if boutique is None:
        return
    boutique.subscription_status = "canceled"
    db.add(boutique)
    db.commit()
    logger.info("Boutique %s subscription canceled", boutique.id)


def _handle_invoice_failed(db: Session, invoice: dict) -> None:
    sub_id = invoice.get("subscription")
    if not sub_id:
        return
    boutique = _find_boutique_by_subscription_id(db, sub_id)
    if boutique is None:
        return
    # Stripe will retry the invoice for ~3 weeks before canceling. While
    # it's in dunning, status becomes `past_due` — we surface that so the
    # UI can prompt the partner to update their card.
    if boutique.subscription_status != "canceled":
        boutique.subscription_status = "past_due"
        db.add(boutique)
        db.commit()
        logger.info("Boutique %s invoice failed → past_due", boutique.id)


def _handle_invoice_paid(db: Session, invoice: dict) -> None:
    sub_id = invoice.get("subscription")
    if not sub_id:
        return
    boutique = _find_boutique_by_subscription_id(db, sub_id)
    if boutique is None:
        return
    # Successful payment unconditionally clears past_due. The
    # subscription.updated event that always follows will also stamp
    # subscription_current_period_end; we don't try to derive it from
    # the invoice here to keep this handler narrow.
    if boutique.subscription_status != "active":
        boutique.subscription_status = "active"
        db.add(boutique)
        db.commit()
        logger.info("Boutique %s invoice paid → active", boutique.id)
