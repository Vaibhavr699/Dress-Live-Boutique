"""
Email-link JWT for bride video-call joins (Next.js `/call/[sessionId]`).

The web page has no login. We mint a signed token when a video booking
is accepted, embed it in the confirmation + reminder emails as
`?token=…`, and exchange it for LiveKit + Decart credentials at
`POST /api/v1/video-calls/web-join`.

Token shape:

  {
    "typ": "video_join",                # discriminator — never confuse
                                        # with a regular auth JWT
    "sub": "<bride user id>",
    "booking_id": <int>,
    "iat": <issued at>,
    "exp": <iat + JOIN_TOKEN_TTL_HOURS>,
  }

Signed with `SECRET_KEY` + `ALGORITHM` from settings, same as the app
auth tokens. We use a separate `typ` claim so a leaked app JWT can never
be used as a join token and vice versa — defense in depth.

TTL is set generously (default 24h after the appointment time) so a
bride who fumbles with the email can still get in. Decart + LiveKit
have their own much shorter session caps — this TTL is only about
when the link is valid, not how long the call can run.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.core.config import settings


logger = logging.getLogger(__name__)


# Default lifetime for a join token. Plenty for "click the link from
# Thursday's email when your appointment was Wednesday." Override per call
# with `mint_join_token(..., ttl=...)` if needed.
DEFAULT_TTL_HOURS = 24


class JoinTokenError(ValueError):
    """Raised when a join token is missing, malformed, expired, or for the
    wrong booking. Endpoints turn this into a 401."""


@dataclass(frozen=True)
class JoinTokenClaims:
    booking_id: int
    user_id: int
    issued_at: datetime
    expires_at: datetime


def mint_join_token(
    *,
    booking_id: int,
    user_id: int,
    ttl: Optional[timedelta] = None,
) -> str:
    """Sign a fresh `typ=video_join` JWT for one booking/user pair.

    Caller is responsible for ensuring `user_id` is the buyer on the
    booking — this function does not load the DB.
    """
    now = datetime.now(timezone.utc)
    expires_at = now + (ttl or timedelta(hours=DEFAULT_TTL_HOURS))
    payload = {
        "typ": "video_join",
        "sub": str(user_id),
        "booking_id": int(booking_id),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_join_token(token: str) -> JoinTokenClaims:
    """Decode + validate a join token.

    Raises `JoinTokenError` for: missing/garbled token, wrong `typ` claim,
    missing `booking_id`/`sub`, signature mismatch, expiry past. Callers
    must STILL verify that `claims.user_id == booking.user_id` before
    issuing any LiveKit/Decart credentials — this function only proves
    the token was minted by us and is still in its TTL window.
    """
    if not token:
        raise JoinTokenError("Missing join token.")

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError as exc:
        # Don't echo the raw JWT error back to the client — it leaks
        # whether the signature failed vs. token expired, which is mildly
        # useful info for attackers. Log it, return a generic error.
        logger.info("Join token verification failed: %s", exc)
        raise JoinTokenError("Invalid or expired join token.") from exc

    if payload.get("typ") != "video_join":
        # An app auth JWT (which uses `sub` but no `typ=video_join`)
        # would otherwise validate here. Block it.
        raise JoinTokenError("Invalid join token type.")

    booking_id = payload.get("booking_id")
    sub = payload.get("sub")
    if not isinstance(booking_id, int) or not sub:
        raise JoinTokenError("Malformed join token.")

    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise JoinTokenError("Malformed join token subject.") from exc

    issued_at = datetime.fromtimestamp(int(payload.get("iat", 0)), tz=timezone.utc)
    expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc)

    return JoinTokenClaims(
        booking_id=booking_id,
        user_id=user_id,
        issued_at=issued_at,
        expires_at=expires_at,
    )
