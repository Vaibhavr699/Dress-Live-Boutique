"""
Notification endpoints.

POST   /push-tokens          → register an Expo push token for current user
DELETE /push-tokens          → unregister a token (by value)
GET    /                     → paginated feed of current user's notifications
POST   /{id}/read            → mark a single notification as read
POST   /read-all             → mark all current user's notifications as read
GET    /unread-count         → cheap counter for the bell badge
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.models.notification import Notification
from app.models.push_token import PushToken
from app.models.user import User

router = APIRouter()


class PushTokenRegisterPayload(BaseModel):
    expo_token: str
    platform: Optional[str] = None
    device_id: Optional[str] = None


class PushTokenDeletePayload(BaseModel):
    expo_token: str


def _serialize_notification(n: Notification) -> dict[str, Any]:
    return {
        "id": n.id,
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "payload": n.payload,
        "action_type": n.action_type,
        "action_id": n.action_id,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.post("/push-tokens", response_model=dict)
def register_push_token(
    *,
    payload: PushTokenRegisterPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    token = (payload.expo_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="expo_token is required.")

    existing = (
        db.query(PushToken)
        .filter(PushToken.user_id == current_user.id, PushToken.expo_token == token)
        .first()
    )
    if existing:
        # Touch last_seen_at + update platform/device_id if they shifted.
        existing.last_seen_at = datetime.now(timezone.utc)
        if payload.platform:
            existing.platform = payload.platform
        if payload.device_id:
            existing.device_id = payload.device_id
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return {"ok": True, "id": existing.id, "created": False}

    row = PushToken(
        user_id=current_user.id,
        expo_token=token,
        platform=payload.platform,
        device_id=payload.device_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "created": True}


@router.delete("/push-tokens", response_model=dict)
def unregister_push_token(
    *,
    payload: PushTokenDeletePayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    token = (payload.expo_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="expo_token is required.")

    deleted = (
        db.query(PushToken)
        .filter(PushToken.user_id == current_user.id, PushToken.expo_token == token)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": deleted}


@router.get("/", response_model=dict)
def list_notifications(
    *,
    cursor: Optional[int] = None,
    limit: int = 30,
    unread_only: bool = False,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if limit < 1 or limit > 100:
        limit = 30

    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if cursor is not None:
        q = q.filter(Notification.id < cursor)
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))

    rows = q.order_by(Notification.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1].id if has_more and rows else None

    return {
        "items": [_serialize_notification(n) for n in rows],
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


@router.get("/unread-count", response_model=dict)
def unread_count(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .count()
    )
    return {"unread": int(count)}


@router.post("/{notification_id}/read", response_model=dict)
def mark_read(
    *,
    notification_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    row = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
    return {"ok": True}


@router.post("/read-all", response_model=dict)
def mark_all_read(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "updated": int(updated)}
