"""Add video ring columns on booking

Revision ID: c7a1d2e3f4a5
Revises: 49b59c71882e
Create Date: 2026-04-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7a1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "49b59c71882e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column("video_ring_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "booking",
        sa.Column("video_ring_from_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_booking_video_ring_from_user",
        "booking",
        "user",
        ["video_ring_from_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_booking_video_ring_from_user", "booking", type_="foreignkey")
    op.drop_column("booking", "video_ring_from_user_id")
    op.drop_column("booking", "video_ring_at")
