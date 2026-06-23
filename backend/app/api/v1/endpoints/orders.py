"""Buyer order endpoints (dress purchases via Stripe).

Flow:
  1. Buyer's cart calls POST /orders/ with { boutique_id, items[] }.
  2. We snapshot dress price/name/image, compute totals in cents, mint a
     Stripe PaymentIntent with transfer_data.destination = boutique
     Connect account, return the client_secret.
  3. Buyer app runs PaymentSheet with that client_secret.
  4. Stripe fires payment_intent.succeeded → our webhook flips the order
     to `paid` and notifies the partner.
"""

from __future__ import annotations

import logging
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_dress import crud_dress
from app.models.order import Order, OrderItem
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderCreateResponse,
    OrderOut,
)
from app.services import stripe_service


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=OrderCreateResponse, include_in_schema=False)
@router.post("", response_model=OrderCreateResponse)
async def create_order(
    *,
    payload: OrderCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "buyer":
        raise HTTPException(
            status_code=403,
            detail="Only customers can place dress orders.",
        )

    boutique = crud_boutique.get(db, id=payload.boutique_id)
    if boutique is None:
        raise HTTPException(status_code=404, detail="Boutique not found.")
    if not boutique.stripe_account_id:
        raise HTTPException(
            status_code=409,
            detail="This boutique hasn't finished setting up payments yet. "
                   "Please try again later or contact them.",
        )

    # Snapshot the dresses — we trust DB prices, not what the client sent.
    snapshots: List[tuple[int, int, str, str | None]] = []  # (dress_id, qty, name, image_url)
    subtotal_cents = 0
    for item in payload.items:
        dress = crud_dress.get(db, id=item.dress_id)
        if dress is None:
            raise HTTPException(
                status_code=400, detail=f"Dress {item.dress_id} not found."
            )
        if dress.boutique_id != boutique.id:
            raise HTTPException(
                status_code=400,
                detail=f"Dress {item.dress_id} does not belong to this boutique.",
            )
        unit_price_cents = int(round((dress.price or 0) * 100))
        if unit_price_cents <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Dress '{dress.name}' has no price set yet.",
            )
        subtotal_cents += unit_price_cents * item.quantity
        snapshots.append((dress.id, item.quantity, dress.name, dress.image_url))

    # Keep the existing UI's flat €15 service fee for parity (see
    # frontend-app/app/(tabs)/checkout.tsx). 0 fee if cart is empty,
    # which we already guard above.
    service_fee_cents = 1500
    total_cents = subtotal_cents + service_fee_cents

    # Platform's cut — basis points of TOTAL (incl. service fee).
    application_fee_cents = (total_cents * int(settings.PLATFORM_FEE_BPS)) // 10000
    # Stripe requires application_fee_amount < total — clamp defensively.
    if application_fee_cents >= total_cents:
        application_fee_cents = max(total_cents - 1, 0)

    # Persist as pending first so we have an id to put in PI metadata.
    order = Order(
        user_id=current_user.id,
        boutique_id=boutique.id,
        status="pending",
        currency=settings.STRIPE_CURRENCY,
        subtotal_cents=subtotal_cents,
        service_fee_cents=service_fee_cents,
        total_cents=total_cents,
        application_fee_cents=application_fee_cents,
    )
    db.add(order)
    db.flush()  # populate order.id without committing

    for dress_id, qty, name, image_url in snapshots:
        dress = crud_dress.get(db, id=dress_id)
        unit_price_cents = int(round((dress.price or 0) * 100)) if dress else 0
        db.add(
            OrderItem(
                order_id=order.id,
                dress_id=dress_id,
                name=name,
                unit_price_cents=unit_price_cents,
                quantity=qty,
                image_url=image_url,
            )
        )

    try:
        pi = stripe_service.create_payment_intent(
            amount_cents=total_cents,
            application_fee_cents=application_fee_cents,
            destination_account_id=boutique.stripe_account_id,
            currency=settings.STRIPE_CURRENCY,
            metadata={
                "order_id": str(order.id),
                "user_id": str(current_user.id),
                "boutique_id": str(boutique.id),
            },
        )
    except stripe_service.StripeConfigError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    except stripe_service.StripeUpstreamError as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail=f"Could not start payment with Stripe: {exc}",
        )

    order.stripe_payment_intent_id = pi.id
    db.commit()
    db.refresh(order)

    if not settings.STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_PUBLISHABLE_KEY is not configured on the server.",
        )

    return OrderCreateResponse(
        order=OrderOut.model_validate(order),
        client_secret=pi.client_secret,
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        stripe_account_id=boutique.stripe_account_id,
    )


@router.get("/me", response_model=List[OrderOut])
async def list_my_orders(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    rows = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [OrderOut.model_validate(r) for r in rows]


@router.get("/partner", response_model=List[OrderOut])
async def list_partner_orders(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "partner" or not current_user.boutique_id:
        raise HTTPException(
            status_code=403, detail="Only partners can list their boutique's orders."
        )
    rows = (
        db.query(Order)
        .filter(Order.boutique_id == current_user.boutique_id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [OrderOut.model_validate(r) for r in rows]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    *,
    order_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    if current_user.role == "partner":
        if order.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not your boutique's order.")
    elif order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your order.")
    return OrderOut.model_validate(order)
