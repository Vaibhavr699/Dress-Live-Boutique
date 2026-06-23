"""add boutique subscription columns (Stripe Billing for partner plans)

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-05-21 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boutique", sa.Column("stripe_customer_id", sa.String(), nullable=True))
    op.add_column("boutique", sa.Column("stripe_subscription_id", sa.String(), nullable=True))
    op.add_column("boutique", sa.Column("subscription_status", sa.String(), nullable=True))
    op.add_column("boutique", sa.Column("subscription_plan", sa.String(), nullable=True))
    op.add_column(
        "boutique",
        sa.Column("subscription_current_period_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_boutique_subscription_status", "boutique", ["subscription_status"]
    )


def downgrade() -> None:
    op.drop_index("ix_boutique_subscription_status", table_name="boutique")
    op.drop_column("boutique", "subscription_current_period_end")
    op.drop_column("boutique", "subscription_plan")
    op.drop_column("boutique", "subscription_status")
    op.drop_column("boutique", "stripe_subscription_id")
    op.drop_column("boutique", "stripe_customer_id")
