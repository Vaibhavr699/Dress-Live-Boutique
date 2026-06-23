"""add aijob.parent_job_id for chained pipeline steps

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-06-15 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("aijob", sa.Column("parent_job_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_aijob_parent_job_id"), "aijob", ["parent_job_id"], unique=False
    )
    op.create_foreign_key(
        "fk_aijob_parent_job_id_aijob",
        "aijob",
        "aijob",
        ["parent_job_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_aijob_parent_job_id_aijob", "aijob", type_="foreignkey")
    op.drop_index(op.f("ix_aijob_parent_job_id"), table_name="aijob")
    op.drop_column("aijob", "parent_job_id")
