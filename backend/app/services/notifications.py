"""
Notification dispatch service.

Persists a `Notification` row for the user, then fans out an Expo push to
every device they have registered. Failures from Expo are logged but never
prevent the in-app feed from being updated — the user can always read the
notification when they open the app again.

Use:
    from app.services.notifications import dispatch
    dispatch(
        db,
        user_id=42,
        kind="booking_accepted",
        title="Your video call was accepted",
        body="Friday, 14 Mar at 3:00 PM",
        action_type="booking",
        action_id=booking.id,
        payload={"scheduled_for": booking.scheduled_for},
    )
"""

from __future__ import annotations

import logging
from typing import Any, Iterable, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.push_token import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_HTTP_TIMEOUT_SECONDS = 10.0


def _is_expo_token(token: str) -> bool:
    token = (token or "").strip()
    return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")


def _build_expo_message(
    expo_token: str,
    *,
    title: str,
    body: Optional[str],
    data: Optional[dict[str, Any]],
) -> dict[str, Any]:
    msg: dict[str, Any] = {
        "to": expo_token,
        "title": title,
        "sound": "default",
        "priority": "high",
    }
    if body:
        msg["body"] = body
    if data:
        msg["data"] = data
    return msg


def _send_to_expo(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not messages:
        return []
    try:
        resp = httpx.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=_HTTP_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json() or {}
        tickets = data.get("data") or []
        return tickets if isinstance(tickets, list) else []
    except Exception as e:
        logger.warning("Expo push send failed: %s", e)
        return []


def _prune_invalid_tokens(db: Session, tokens: Iterable[PushToken], tickets: list[dict[str, Any]]) -> None:
    """If Expo reports DeviceNotRegistered for a token, drop it from the DB."""
    token_list = list(tokens)
    if not token_list or not tickets:
        return
    for tok, ticket in zip(token_list, tickets):
        if not isinstance(ticket, dict):
            continue
        if ticket.get("status") == "error":
            error_type = (ticket.get("details") or {}).get("error", "")
            if error_type in ("DeviceNotRegistered", "InvalidCredentials"):
                logger.info("Dropping invalid Expo token id=%s reason=%s", tok.id, error_type)
                db.delete(tok)
    try:
        db.commit()
    except Exception:
        db.rollback()


def dispatch(
    db: Session,
    *,
    user_id: int,
    kind: str,
    title: str,
    body: Optional[str] = None,
    action_type: Optional[str] = None,
    action_id: Optional[int] = None,
    payload: Optional[dict[str, Any]] = None,
) -> Notification:
    """
    1. Insert a Notification row for the user.
    2. Send an Expo push to every registered device for that user.
    3. Drop tokens that come back as DeviceNotRegistered.

    Returns the persisted Notification row (always — push failures don't
    block in-app delivery).
    """
    notif = Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        action_type=action_type,
        action_id=action_id,
        payload=payload or None,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # Build push data so a tap can deep-link.
    push_data: dict[str, Any] = {
        "notification_id": notif.id,
        "kind": kind,
    }
    if action_type:
        push_data["type"] = action_type  # legacy key already read by buyer app
        push_data["action_type"] = action_type
    if action_id is not None:
        push_data["bookingId"] = action_id if action_type == "booking" else None
        push_data["action_id"] = action_id
    if payload:
        push_data.update(payload)

    tokens = (
        db.query(PushToken)
        .filter(PushToken.user_id == user_id)
        .all()
    )
    valid_tokens = [t for t in tokens if _is_expo_token(t.expo_token)]
    messages = [
        _build_expo_message(t.expo_token, title=title, body=body, data=push_data)
        for t in valid_tokens
    ]

    tickets = _send_to_expo(messages)
    if tickets:
        _prune_invalid_tokens(db, valid_tokens, tickets)

    return notif
