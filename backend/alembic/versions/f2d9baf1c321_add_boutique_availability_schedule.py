"""add boutique availability schedule

Revision ID: f2d9baf1c321
Revises: c7a1d2e3f4a5
Create Date: 2026-04-20 11:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f2d9baf1c321"
down_revision = "c7a1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boutique", sa.Column("availability_schedule", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("boutique", "availability_schedule")
