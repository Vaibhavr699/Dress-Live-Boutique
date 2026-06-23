from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class TeamMember(Base):
    """A boutique's advisor / consultant.

    Created in `pending` status when a partner invites them by email. Flips to
    `active` once the advisor opens the emailed link and sets a password — which
    also provisions their advisor `User` login (role="advisor", linked to the
    same boutique).

    The partner only supplies `email` + `role` at invite time; `name`,
    `languages` and `availability_schedule` are filled in later (the advisor
    types their name on the accept page; languages/availability are edited from
    the team-member + availability screens), so they're all nullable here.
    `languages` and `availability_schedule` are JSON-encoded text so the model
    stays portable across DBs.
    """

    __tablename__ = "team_member"
    __table_args__ = (
        UniqueConstraint("boutique_id", "email", name="uq_team_member_boutique_email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    boutique_id = Column(Integer, ForeignKey("boutique.id"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # Stylist | Consultant | Manager | Owner
    name = Column(String, nullable=True)
    languages = Column(Text, nullable=True)  # JSON list[str]
    availability_on = Column(Boolean, nullable=False, default=False)
    availability_schedule = Column(Text, nullable=True)  # JSON list[{day,value}]
    status = Column(String, nullable=False, default="pending", index=True)  # pending | active
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    invite_token = Column(String, nullable=True, unique=True, index=True)
    invite_expires_at = Column(DateTime(timezone=True), nullable=True)
    invited_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    boutique = relationship("Boutique")
    user = relationship("User")
