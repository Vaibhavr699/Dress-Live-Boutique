"""add user body measurements

Revision ID: c3d4e5f6a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-05-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a1b2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("weight_kg", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("bust_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("waist_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("hips_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("shoulder_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("arm_length_cm", sa.Float(), nullable=True))
    op.add_column("user", sa.Column("measurements_source", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "measurements_source")
    op.drop_column("user", "arm_length_cm")
    op.drop_column("user", "shoulder_cm")
    op.drop_column("user", "hips_cm")
    op.drop_column("user", "waist_cm")
    op.drop_column("user", "bust_cm")
    op.drop_column("user", "weight_kg")
    op.drop_column("user", "height_cm")
