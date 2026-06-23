from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Order(Base):
    """A buyer's dress purchase. One Order maps to exactly one Stripe
    PaymentIntent and exactly one boutique — the cart is split server-side
    if the buyer ever mixes boutiques. Status mirrors the PaymentIntent
    lifecycle so we don't have two sources of truth:

      - pending   : intent created, awaiting confirm
      - paid      : payment_intent.succeeded webhook landed
      - canceled  : payment_intent.canceled / payment_intent.payment_failed
      - refunded  : refund.created webhook landed
    """

    __tablename__ = "order"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    boutique_id = Column(Integer, ForeignKey("boutique.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    currency = Column(String(8), nullable=False, default="eur")
    # All money in minor units (cents) — no Float to avoid drift.
    subtotal_cents = Column(Integer, nullable=False)
    service_fee_cents = Column(Integer, nullable=False, default=0)
    total_cents = Column(Integer, nullable=False)
    application_fee_cents = Column(Integer, nullable=False, default=0)
    stripe_payment_intent_id = Column(String, nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User")
    boutique = relationship("Boutique")
    items = relationship(
        "OrderItem", cascade="all, delete-orphan", back_populates="order"
    )


class OrderItem(Base):
    """Frozen line item — name/price/image are copied from the dress row at
    create time so the order receipt stays meaningful even if the partner
    edits the dress later."""

    __tablename__ = "order_item"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("order.id", ondelete="CASCADE"), nullable=False, index=True)
    dress_id = Column(Integer, ForeignKey("dress.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    unit_price_cents = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    image_url = Column(String, nullable=True)

    order = relationship("Order", back_populates="items")
