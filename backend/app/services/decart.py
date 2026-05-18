"""
Decart realtime VTON (Lucy 2.1) — server-side token broker.

Decart's realtime SDK runs in the client (browser / React Native) but the
long-lived API key MUST stay server-side. The flow is:

  1. Backend keeps `DECART_API_KEY` (dct_* / sk_*) — never shipped.
  2. Bride asks backend for a session → backend calls
     `POST https://api.decart.ai/v1/client/tokens` with the long key and
     gets back a short-lived `ek_*` token scoped to one model + a TTL.
  3. Backend returns the `ek_*` token to the bride; she hands it to the
     Decart SDK in the browser. The SDK can only use it to render with
     `lucy-2.1-vton` and only for the TTL we chose.

This module does NOT know about bookings, users, or budgets — those are
enforced one layer up in the endpoint. It just talks to Decart's REST
API.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import httpx
from pydantic import BaseModel

from app.core.config import settings


logger = logging.getLogger(__name__)


class DecartClientToken(BaseModel):
    api_key: str          # short-lived token, ek_* — give this to the SDK
    expires_at: datetime
    model: str            # echoed for the client's convenience


class DecartConfigError(RuntimeError):
    """Raised when DECART_API_KEY is missing on the server."""


class DecartUpstreamError(RuntimeError):
    """Raised when Decart's API returns an unexpected response."""


async def mint_client_token(
    *,
    ttl_seconds: Optional[int] = None,
    max_session_seconds: Optional[int] = None,
    allowed_origins: Optional[list[str]] = None,
    model: Optional[str] = None,
) -> DecartClientToken:
    """Mint a short-lived per-session Decart client token.

    Calls `POST {DECART_API_BASE}/client/tokens`. Returns the `ek_*` token
    the realtime SDK expects as its `apiKey` parameter, plus its expiry.

    Constraints applied:
      - `allowedModels`: locked to our configured realtime model so a
        leaked token can't be used to invoke other (more expensive) models.
      - `expiresIn`: short TTL — bride pulls a fresh token each join.
      - `realtime.maxSessionDuration`: hard cap so Decart auto-closes the
        stream even if the LiveKit room never ends.
      - `allowedOrigins`: when provided, Decart rejects realtime
        connections from any other Origin header (browser-only enforcement;
        useful for the future Next.js page).
    """
    if not settings.DECART_API_KEY:
        raise DecartConfigError(
            "DECART_API_KEY is not configured on the server."
        )

    chosen_model = (model or settings.DECART_REALTIME_MODEL).strip()
    # Decart caps `expiresIn` at 3600s (returns 400 above that). Clamp
    # silently rather than 500-ing if someone misconfigures the env var.
    DECART_MAX_TTL_SECONDS = 3600
    expires_in = int(ttl_seconds or settings.DECART_CLIENT_TOKEN_TTL_MINUTES * 60)
    expires_in = min(max(60, expires_in), DECART_MAX_TTL_SECONDS)
    max_duration = int(max_session_seconds or settings.DECART_MAX_SESSION_SECONDS)

    body: dict = {
        "expiresIn": expires_in,
        "allowedModels": [chosen_model],
        "constraints": {
            "realtime": {"maxSessionDuration": max_duration},
        },
    }
    if allowed_origins:
        body["allowedOrigins"] = list(allowed_origins)

    url = f"{settings.DECART_API_BASE.rstrip('/')}/client/tokens"
    headers = {
        "x-api-key": settings.DECART_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        logger.exception("Decart token mint network failure")
        raise DecartUpstreamError(f"Decart request failed: {exc}") from exc

    if resp.status_code != 200:
        # Don't leak the API key into logs — only status + first 200 chars
        # of the body, which is Decart's own error JSON.
        snippet = resp.text[:200]
        logger.warning(
            "Decart token mint returned %s: %s", resp.status_code, snippet
        )
        raise DecartUpstreamError(
            f"Decart token mint failed ({resp.status_code}): {snippet}"
        )

    data = resp.json()
    short_token = data.get("apiKey")
    expires_at_raw = data.get("expiresAt")
    if not short_token or not expires_at_raw:
        raise DecartUpstreamError(
            f"Decart returned an unexpected payload: {data!r}"
        )

    return DecartClientToken(
        api_key=short_token,
        expires_at=_parse_decart_timestamp(expires_at_raw),
        model=chosen_model,
    )


def _parse_decart_timestamp(value: str) -> datetime:
    """Decart returns ISO 8601 with a trailing `Z`. fromisoformat() only
    learned to parse `Z` in Python 3.11; normalize to `+00:00` for older
    runtimes too."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
