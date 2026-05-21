from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from app.db.base_class import Base

class Boutique(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String, index=True, nullable=True)
    logo_url = Column(String, nullable=True)
    header_image_url = Column(String, nullable=True)
    interior_image_url = Column(String, nullable=True)
    availability_schedule = Column(Text, nullable=True)
    is_visible_to_customers = Column(Boolean, nullable=False, default=True)
    # Stripe Connect Express account id (acct_*). Null until the partner
    # finishes onboarding through the Connect flow. Required before we can
    # accept dress purchases — orders without it are blocked at create time.
    stripe_account_id = Column(String, nullable=True)
    # Stripe Billing (partner subscription). cus_* identifies the boutique
    # to Stripe; sub_* is the current Subscription (re-created when the
    # partner cancels and re-subscribes). subscription_status mirrors
    # Stripe's own lifecycle so we have a single source of truth without
    # a round-trip to Stripe on every request:
    #   active     — paying, can publish dresses
    #   past_due   — last invoice failed, grace period before Stripe cancels
    #   canceled   — partner or Stripe canceled; blocks new publishes
    #   incomplete — first invoice never confirmed (card declined at checkout)
    #   None       — never subscribed
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_status = Column(String, nullable=True, index=True)
    subscription_plan = Column(String, nullable=True)  # 'monthly' | 'annual'
    subscription_current_period_end = Column(DateTime(timezone=True), nullable=True)
