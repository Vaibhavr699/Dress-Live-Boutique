"""add dress images table and standardization columns

Revision ID: c1d2e3f4a5b6
Revises: b8c9d0e1f2a3
Create Date: 2026-06-15 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dressimage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dress_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dress_id"], ["dress.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dressimage_id"), "dressimage", ["id"], unique=False)
    op.create_index(
        op.f("ix_dressimage_dress_id"), "dressimage", ["dress_id"], unique=False
    )
    op.create_index(op.f("ix_dressimage_role"), "dressimage", ["role"], unique=False)

    op.add_column(
        "dress",
        sa.Column(
            "standardization_status",
            sa.String(),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "dress", sa.Column("standardized_image_url", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("dress", "standardized_image_url")
    op.drop_column("dress", "standardization_status")
    op.drop_index(op.f("ix_dressimage_role"), table_name="dressimage")
    op.drop_index(op.f("ix_dressimage_dress_id"), table_name="dressimage")
    op.drop_index(op.f("ix_dressimage_id"), table_name="dressimage")
    op.drop_table("dressimage")
