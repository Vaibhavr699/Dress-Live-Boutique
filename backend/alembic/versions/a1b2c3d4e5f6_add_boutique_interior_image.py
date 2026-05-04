"""add boutique interior image url

Revision ID: a1b2c3d4e5f6
Revises: f2d9baf1c321
Create Date: 2026-04-23 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "f2d9baf1c321"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boutique", sa.Column("interior_image_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("boutique", "interior_image_url")
