"""add team_member table (advisor invitations)

Revision ID: a7b8c9d0e1f2
Revises: f2a3b4c5d6e7
Create Date: 2026-06-04 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_member",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("boutique_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("languages", sa.Text(), nullable=True),
        sa.Column("availability_on", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("availability_schedule", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("invite_token", sa.String(), nullable=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["boutique_id"], ["boutique.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("boutique_id", "email", name="uq_team_member_boutique_email"),
    )
    op.create_index("ix_team_member_boutique_id", "team_member", ["boutique_id"])
    op.create_index("ix_team_member_email", "team_member", ["email"])
    op.create_index("ix_team_member_status", "team_member", ["status"])
    op.create_index("ix_team_member_invite_token", "team_member", ["invite_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_team_member_invite_token", table_name="team_member")
    op.drop_index("ix_team_member_status", table_name="team_member")
    op.drop_index("ix_team_member_email", table_name="team_member")
    op.drop_index("ix_team_member_boutique_id", table_name="team_member")
    op.drop_table("team_member")
