"""add orders table + boutique.stripe_account_id (Stripe Connect)

Revision ID: e1f2a3b4c5d6
Revises: d5e6f7a8b9c0
Create Date: 2026-05-20 12:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e1f2a3b4c5d6"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "boutique",
        sa.Column("stripe_account_id", sa.String(), nullable=True),
    )

    op.create_table(
        "order",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("boutique_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="eur"),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False),
        sa.Column("service_fee_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("application_fee_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stripe_payment_intent_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["boutique_id"], ["boutique.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_payment_intent_id"),
    )
    op.create_index("ix_order_user_id", "order", ["user_id"])
    op.create_index("ix_order_boutique_id", "order", ["boutique_id"])
    op.create_index("ix_order_status", "order", ["status"])
    op.create_index(
        "ix_order_stripe_payment_intent_id", "order", ["stripe_payment_intent_id"]
    )

    op.create_table(
        "order_item",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("dress_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["order.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dress_id"], ["dress.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_item_order_id", "order_item", ["order_id"])
    op.create_index("ix_order_item_dress_id", "order_item", ["dress_id"])


def downgrade() -> None:
    op.drop_index("ix_order_item_dress_id", table_name="order_item")
    op.drop_index("ix_order_item_order_id", table_name="order_item")
    op.drop_table("order_item")

    op.drop_index("ix_order_stripe_payment_intent_id", table_name="order")
    op.drop_index("ix_order_status", table_name="order")
    op.drop_index("ix_order_boutique_id", table_name="order")
    op.drop_index("ix_order_user_id", table_name="order")
    op.drop_table("order")

    op.drop_column("boutique", "stripe_account_id")
