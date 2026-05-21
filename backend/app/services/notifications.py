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
    image_url: Optional[str] = None,
    sound: Optional[str] = "default",
    android_channel_id: Optional[str] = None,
    ios_category_id: Optional[str] = None,
    priority: str = "high",
    badge: Optional[int] = None,
) -> dict[str, Any]:
    """
    Compose a single Expo push payload.

    Expo's push API surfaces a subset of FCM + APNs features:
    - `richContent.image` → image attachment on both platforms
    - `sound` → 'default' or a bundled filename (must be configured via the
      expo-notifications plugin in app.json for custom sounds to ship)
    - `channelId` → Android-only; we register channels client-side at boot
    - `categoryId` → iOS-only; categories with inline action buttons must be
      registered client-side via setNotificationCategoryAsync
    - `priority` → 'high' speeds up delivery on Android
    - `badge` → app icon badge count on iOS
    """
    msg: dict[str, Any] = {
        "to": expo_token,
        "title": title,
        "priority": priority,
    }
    if sound:
        msg["sound"] = sound
    if body:
        msg["body"] = body
    if data:
        msg["data"] = data
    if image_url:
        msg["richContent"] = {"image": image_url}
    if android_channel_id:
        msg["channelId"] = android_channel_id
    if ios_category_id:
        msg["categoryId"] = ios_category_id
    if badge is not None:
        msg["badge"] = badge
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


# Map our notification "kind" to the Android channel + iOS category + sound.
# Channels and categories must be registered on the client first (see
# frontend-app/_layout.tsx and boutique-app/_layout.tsx).
#
# Channels (Android):
#   bookings-high  → high importance, custom alert sound, vibrates
#   reminders      → default importance
#   recommendations→ low importance, no sound
#   promotions     → min importance, silent
#
# Categories (iOS):
#   booking-request   → "Accept" / "Decline" inline buttons (partner side)
#   booking-update    → "View" button (default tap also works)
#
# Sounds:
#   'default' = OS default. Custom filenames must be bundled via the
#   expo-notifications plugin in app.json.
_KIND_DEFAULTS: dict[str, dict[str, Optional[str]]] = {
    # Partner-facing
    "booking_request_received": {
        "channel_id": "bookings-high",
        "category_id": "booking-request",
        "sound": "default",
    },
    # Buyer-facing booking lifecycle
    "booking_requested": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_accepted": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_rejected": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_rescheduled": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_completed": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_updated": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "booking_reminder": {"channel_id": "reminders", "category_id": "booking-update", "sound": "default"},
    # Video-call lifecycle. Dedicated `video-call` channel with a phone-call-like
    # vibration pattern (longer pulses, repeated) — registered on the client. iOS
    # uses the booking-update category so the user still gets a "View" inline
    # action and a tap opens the call screen.
    "video_call_incoming": {"channel_id": "video-call", "category_id": "booking-update", "sound": "default"},
    "video_call_buyer_joined": {"channel_id": "video-call", "category_id": "booking-update", "sound": "default"},
    "video_call_partner_joined": {"channel_id": "video-call", "category_id": "booking-update", "sound": "default"},
    # Order / payment lifecycle. `bookings-high` channel reuses the same
    # high-importance heads-up display we already approved with the user.
    "order_paid": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    "order_refunded": {"channel_id": "bookings-high", "category_id": "booking-update", "sound": "default"},
    # Future kinds
    "price_drop": {"channel_id": "recommendations", "category_id": None, "sound": None},
    "promotion": {"channel_id": "promotions", "category_id": None, "sound": None},
}


def _defaults_for_kind(kind: str) -> dict[str, Optional[str]]:
    return _KIND_DEFAULTS.get(kind, {"channel_id": None, "category_id": None, "sound": "default"})


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
    image_url: Optional[str] = None,
    android_channel_id: Optional[str] = None,
    ios_category_id: Optional[str] = None,
    sound: Optional[str] = None,
) -> Notification:
    """
    1. Insert a Notification row for the user.
    2. Send an Expo push to every registered device for that user, including
       rich image, sound, Android channel, iOS category as appropriate.
    3. Drop tokens that come back as DeviceNotRegistered.

    Defaults for channel/category/sound are looked up from `_KIND_DEFAULTS`
    so callers don't have to pass them per call. Explicit args override.
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
    if image_url:
        push_data["image_url"] = image_url
    if payload:
        push_data.update(payload)

    # Resolve channel / category / sound — explicit args win over kind defaults.
    defaults = _defaults_for_kind(kind)
    resolved_channel = android_channel_id or defaults.get("channel_id")
    resolved_category = ios_category_id or defaults.get("category_id")
    resolved_sound = sound if sound is not None else defaults.get("sound")

    tokens = (
        db.query(PushToken)
        .filter(PushToken.user_id == user_id)
        .all()
    )
    valid_tokens = [t for t in tokens if _is_expo_token(t.expo_token)]
    messages = [
        _build_expo_message(
            t.expo_token,
            title=title,
            body=body,
            data=push_data,
            image_url=image_url,
            sound=resolved_sound,
            android_channel_id=resolved_channel,
            ios_category_id=resolved_category,
        )
        for t in valid_tokens
    ]

    tickets = _send_to_expo(messages)
    if tickets:
        _prune_invalid_tokens(db, valid_tokens, tickets)

    return notif
