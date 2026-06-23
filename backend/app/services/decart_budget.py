"""
Budget guard for Decart realtime VTON sessions.

Two enforcement layers, both checked when a fresh client token is requested:

  1. Daily USD cap (`DECART_DAILY_BUDGET_USD`). Once today's estimated
     spend reaches the cap, all new sessions are refused for the rest of
     the UTC day. Existing in-flight sessions continue (Decart enforces
     `maxSessionDuration` server-side, so they will close on their own).
  2. Per-booking session-second cap (`DECART_PER_BOOKING_SECONDS_LIMIT`).
     A single booking can't burn through the whole daily budget alone —
     once a booking exceeds its cap, further token requests for the same
     booking are refused even if the daily budget has headroom.

State is in-process: a backend restart resets the counters. Fine for
single-instance dev and early prod. For multi-worker, swap the in-memory
dict for Redis (the public API stays the same).

Sister to `runpod_budget.py` — same shape, different units. RunPod meters
per-call; Decart meters per-second of active rendering, so this module
tracks elapsed seconds.

This module knows *nothing* about Decart's actual API. It just answers:
  - "are we allowed to start a new session for this booking?" (check_budget)
  - "we just ran a session for N seconds" (record_session_seconds)
  - "estimate cost from N seconds of active render"  (estimate_cost_usd)

Counters reset automatically at UTC midnight on the next read.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings


@dataclass
class BudgetDecision:
    allowed: bool
    reason: Optional[str] = None
    daily_spend_usd: float = 0.0
    daily_budget_usd: float = 0.0
    booking_seconds: int = 0
    booking_seconds_limit: int = 0


_lock = threading.Lock()
_state: dict = {
    "date": None,                       # UTC YYYY-MM-DD for the current accumulator
    "spend_usd": 0.0,                   # cumulative spend today
    "seconds_by_booking": {},           # {booking_id: int}, resets daily
    "daily_disabled_on_date": None,     # set when budget is tripped today
}


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _ensure_today_locked() -> None:
    today = _today_utc()
    if _state["date"] != today:
        _state["date"] = today
        _state["spend_usd"] = 0.0
        _state["seconds_by_booking"] = {}
        _state["daily_disabled_on_date"] = None


def _build_decision_locked(allowed: bool, reason: Optional[str], booking_id: int) -> BudgetDecision:
    return BudgetDecision(
        allowed=allowed,
        reason=reason,
        daily_spend_usd=round(_state["spend_usd"], 4),
        daily_budget_usd=float(settings.DECART_DAILY_BUDGET_USD),
        booking_seconds=int(_state["seconds_by_booking"].get(booking_id, 0)),
        booking_seconds_limit=int(settings.DECART_PER_BOOKING_SECONDS_LIMIT),
    )


def estimate_cost_usd(seconds: float) -> float:
    """Convert a duration of active rendering to an estimated USD cost.

    The rate (`DECART_COST_PER_SECOND_USD`) is a config default; tune it
    once real Decart invoices arrive.
    """
    rate = float(settings.DECART_COST_PER_SECOND_USD)
    return max(0.0, float(seconds)) * rate


def check_budget(booking_id: int) -> BudgetDecision:
    """Decide whether a NEW Decart session may start for this booking.

    Does NOT record usage. Callers must invoke `record_session_seconds`
    after a session ends so the spend counter advances.
    """
    with _lock:
        _ensure_today_locked()

        if not settings.DECART_API_KEY:
            return _build_decision_locked(
                False, "Decart not configured (DECART_API_KEY missing).", booking_id
            )

        if _state["daily_disabled_on_date"] == _state["date"]:
            return _build_decision_locked(
                False,
                f"Daily Decart budget (${settings.DECART_DAILY_BUDGET_USD:.2f}) "
                "exhausted; resumes at UTC midnight.",
                booking_id,
            )

        daily_budget = float(settings.DECART_DAILY_BUDGET_USD)
        if daily_budget > 0 and _state["spend_usd"] >= daily_budget:
            _state["daily_disabled_on_date"] = _state["date"]
            return _build_decision_locked(
                False,
                f"Daily Decart budget (${daily_budget:.2f}) reached; "
                "resumes at UTC midnight.",
                booking_id,
            )

        per_booking_limit = int(settings.DECART_PER_BOOKING_SECONDS_LIMIT)
        booking_seconds = int(_state["seconds_by_booking"].get(booking_id, 0))
        if per_booking_limit > 0 and booking_seconds >= per_booking_limit:
            return _build_decision_locked(
                False,
                f"Per-booking Decart session limit ({per_booking_limit}s) "
                "reached for this video call.",
                booking_id,
            )

        return _build_decision_locked(True, None, booking_id)


def record_session_seconds(
    booking_id: int,
    seconds: float,
    cost_usd: Optional[float] = None,
) -> BudgetDecision:
    """Record N seconds of active Decart rendering for a booking.

    Called when a session ends (typically from the LiveKit `room_finished`
    webhook, where `seconds = ended_at - started_at`). If `cost_usd` is
    None we fall back to the configured per-second estimate.
    """
    if cost_usd is None:
        cost_usd = estimate_cost_usd(seconds)
    cost = max(0.0, float(cost_usd))
    add_seconds = max(0, int(seconds))

    with _lock:
        _ensure_today_locked()
        _state["spend_usd"] += cost
        _state["seconds_by_booking"][booking_id] = (
            int(_state["seconds_by_booking"].get(booking_id, 0)) + add_seconds
        )

        daily_budget = float(settings.DECART_DAILY_BUDGET_USD)
        if daily_budget > 0 and _state["spend_usd"] >= daily_budget:
            _state["daily_disabled_on_date"] = _state["date"]

        return _build_decision_locked(True, None, booking_id)


def status_snapshot() -> dict:
    """Operator-friendly view of today's Decart spend + headroom. Wire
    this into a small admin endpoint when you want a live dashboard."""
    with _lock:
        _ensure_today_locked()
        daily_budget = float(settings.DECART_DAILY_BUDGET_USD)
        spend = float(_state["spend_usd"])
        return {
            "configured": bool(settings.DECART_API_KEY),
            "model": settings.DECART_REALTIME_MODEL,
            "date_utc": _state["date"],
            "daily_spend_usd": round(spend, 4),
            "daily_budget_usd": daily_budget,
            "daily_remaining_usd": (
                round(max(0.0, daily_budget - spend), 4) if daily_budget > 0 else None
            ),
            "daily_disabled": _state["daily_disabled_on_date"] == _state["date"],
            "active_bookings_today": len(_state["seconds_by_booking"]),
            "per_booking_seconds_limit": int(settings.DECART_PER_BOOKING_SECONDS_LIMIT),
            "per_second_cost_usd_estimate": float(settings.DECART_COST_PER_SECOND_USD),
        }


def reset_for_tests() -> None:
    """Test helper — clear all in-memory state. Not for production use."""
    with _lock:
        _state["date"] = None
        _state["spend_usd"] = 0.0
        _state["seconds_by_booking"] = {}
        _state["daily_disabled_on_date"] = None
