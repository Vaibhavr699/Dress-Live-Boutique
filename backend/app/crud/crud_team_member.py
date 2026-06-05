import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.team_member import TeamMember


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _invite_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.TEAM_INVITE_TTL_DAYS)


class CRUDTeamMember:
    def get(self, db: Session, id: int) -> Optional[TeamMember]:
        return db.query(TeamMember).filter(TeamMember.id == id).first()

    def get_by_token(self, db: Session, token: str) -> Optional[TeamMember]:
        if not token:
            return None
        return db.query(TeamMember).filter(TeamMember.invite_token == token).first()

    def get_by_user_id(self, db: Session, *, user_id: int) -> Optional[TeamMember]:
        """The team_member row an accepted advisor is linked to (set on accept)."""
        return db.query(TeamMember).filter(TeamMember.user_id == user_id).first()

    def get_multi_by_boutique(self, db: Session, *, boutique_id: int) -> List[TeamMember]:
        return (
            db.query(TeamMember)
            .filter(TeamMember.boutique_id == boutique_id)
            .order_by(TeamMember.created_at.desc())
            .all()
        )

    def get_by_boutique_email(
        self, db: Session, *, boutique_id: int, email: str
    ) -> Optional[TeamMember]:
        return (
            db.query(TeamMember)
            .filter(
                TeamMember.boutique_id == boutique_id,
                TeamMember.email == email,
            )
            .first()
        )

    def create_invite(
        self, db: Session, *, boutique_id: int, email: str, role: str
    ) -> TeamMember:
        db_obj = TeamMember(
            boutique_id=boutique_id,
            email=email,
            role=role,
            status="pending",
            availability_on=False,
            invite_token=_new_token(),
            invite_expires_at=_invite_expiry(),
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def regenerate_invite(self, db: Session, *, db_obj: TeamMember) -> TeamMember:
        db_obj.invite_token = _new_token()
        db_obj.invite_expires_at = _invite_expiry()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, *, db_obj: TeamMember, updates: Dict[str, Any]) -> TeamMember:
        """Apply a partial update. `languages` (list[str]) and
        `availability_schedule` (list[dict]) are JSON-encoded into their text
        columns; everything else is set as-is. Keys with value None are skipped
        so callers can pass a sparse dict."""
        for field, value in updates.items():
            if value is None:
                continue
            if field == "languages":
                db_obj.languages = json.dumps(list(value))
            elif field == "availability_schedule":
                db_obj.availability_schedule = json.dumps(value)
            elif hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def mark_accepted(self, db: Session, *, db_obj: TeamMember, user_id: int) -> TeamMember:
        db_obj.status = "active"
        db_obj.user_id = user_id
        db_obj.accepted_at = datetime.now(timezone.utc)
        db_obj.invite_token = None
        db_obj.invite_expires_at = None
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: int) -> Optional[TeamMember]:
        obj = self.get(db, id=id)
        if not obj:
            return None
        db.delete(obj)
        db.commit()
        return obj


crud_team_member = CRUDTeamMember()
