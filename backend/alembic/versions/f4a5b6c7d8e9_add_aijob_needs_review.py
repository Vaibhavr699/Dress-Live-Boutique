"""add aijob.needs_review for the human review queue

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-15 15:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "aijob",
        sa.Column(
            "needs_review", sa.Boolean(), nullable=False, server_default="false"
        ),
    )
    op.create_index(
        op.f("ix_aijob_needs_review"), "aijob", ["needs_review"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_aijob_needs_review"), table_name="aijob")
    op.drop_column("aijob", "needs_review")
