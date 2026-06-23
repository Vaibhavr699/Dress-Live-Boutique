"""Add booking session timestamps (started_at, ended_at)

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a1b2
Create Date: 2026-05-18

Backs the video-call lifecycle: `started_at` is stamped when the first
LiveKit token is issued for a booking; `ended_at` is stamped from the
LiveKit `room_finished` webhook (fired only when the room is empty).
The delta is what `decart_budget.record_session_seconds` accumulates.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "booking",
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("booking", "ended_at")
    op.drop_column("booking", "started_at")
