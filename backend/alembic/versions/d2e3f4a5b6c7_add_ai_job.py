"""add ai_job table for async pipeline backbone

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-15 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aijob",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("provider_job_id", sa.String(), nullable=True),
        sa.Column(
            "input",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dress_id", sa.Integer(), nullable=True),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dress_id"], ["dress.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_id"], ["booking.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_aijob_id"), "aijob", ["id"], unique=False)
    op.create_index(op.f("ix_aijob_kind"), "aijob", ["kind"], unique=False)
    op.create_index(op.f("ix_aijob_status"), "aijob", ["status"], unique=False)
    op.create_index(
        op.f("ix_aijob_provider_job_id"), "aijob", ["provider_job_id"], unique=False
    )
    op.create_index(op.f("ix_aijob_dress_id"), "aijob", ["dress_id"], unique=False)
    op.create_index(
        op.f("ix_aijob_booking_id"), "aijob", ["booking_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_aijob_booking_id"), table_name="aijob")
    op.drop_index(op.f("ix_aijob_dress_id"), table_name="aijob")
    op.drop_index(op.f("ix_aijob_provider_job_id"), table_name="aijob")
    op.drop_index(op.f("ix_aijob_status"), table_name="aijob")
    op.drop_index(op.f("ix_aijob_kind"), table_name="aijob")
    op.drop_index(op.f("ix_aijob_id"), table_name="aijob")
    op.drop_table("aijob")
