"""
Budget guard for RunPod GPU inference calls.

Two enforcement layers, both checked on every `check_budget` call:

  1. Daily USD cap (`RUNPOD_DAILY_BUDGET_USD`). Once today's estimated
     spend reaches the cap, all RunPod calls are refused for the rest of
     the UTC day. The render path falls back to the free OpenCV pipeline.
  2. Per-booking call cap (`RUNPOD_PER_BOOKING_CALL_LIMIT`). A single
     video session can't burn through the whole daily budget alone — once
     a booking hits its cap it falls back even if the daily budget has
     headroom left.

State is in-process for now: a backend restart resets the counters. Fine
for single-instance dev and early prod. For a multi-worker deployment,
swap the in-memory dict for Redis (the public API stays the same).

Dates are UTC; counters automatically reset at UTC midnight on the next
read.

This module knows *nothing* about how RunPod is actually called — it
just enforces "are we allowed to spend?" and "we just spent." Wire it
into whichever code path eventually invokes the RunPod endpoint.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings


@dataclass
class BudgetDecision:
    allowed: bool
    reason: Optional[str] = None
    daily_spend_usd: float = 0.0
    daily_budget_usd: float = 0.0
    booking_calls: int = 0
    booking_call_limit: int = 0


_lock = threading.Lock()
_state: dict = {
    "date": None,                       # UTC YYYY-MM-DD for the current accumulator
    "spend_usd": 0.0,                   # cumulative spend today
    "calls_by_booking": {},             # {booking_id: int}, resets daily
    "daily_disabled_on_date": None,     # set when budget is tripped today
}


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _ensure_today_locked() -> None:
    today = _today_utc()
    if _state["date"] != today:
        _state["date"] = today
        _state["spend_usd"] = 0.0
        _state["calls_by_booking"] = {}
        _state["daily_disabled_on_date"] = None


def _build_decision_locked(allowed: bool, reason: Optional[str], booking_id: int) -> BudgetDecision:
    return BudgetDecision(
        allowed=allowed,
        reason=reason,
        daily_spend_usd=round(_state["spend_usd"], 4),
        daily_budget_usd=float(settings.RUNPOD_DAILY_BUDGET_USD),
        booking_calls=int(_state["calls_by_booking"].get(booking_id, 0)),
        booking_call_limit=int(settings.RUNPOD_PER_BOOKING_CALL_LIMIT),
    )


def check_budget(booking_id: int) -> BudgetDecision:
    """Decide whether a RunPod call is allowed *right now* for this booking.

    Does NOT record the call. Callers must invoke `record_call(...)` after
    a successful RunPod invocation so the spend counter advances.
    """
    with _lock:
        _ensure_today_locked()

        if not bool(settings.RUNPOD_ENABLED):
            return _build_decision_locked(False, "RunPod disabled (RUNPOD_ENABLED=false).", booking_id)

        if _state["daily_disabled_on_date"] == _state["date"]:
            return _build_decision_locked(
                False,
                f"Daily RunPod budget (${settings.RUNPOD_DAILY_BUDGET_USD:.2f}) "
                "exhausted; resumes at UTC midnight.",
                booking_id,
            )

        daily_budget = float(settings.RUNPOD_DAILY_BUDGET_USD)
        if daily_budget > 0 and _state["spend_usd"] >= daily_budget:
            _state["daily_disabled_on_date"] = _state["date"]
            return _build_decision_locked(
                False,
                f"Daily RunPod budget (${daily_budget:.2f}) reached; "
                "resumes at UTC midnight.",
                booking_id,
            )

        per_booking_limit = int(settings.RUNPOD_PER_BOOKING_CALL_LIMIT)
        booking_calls = int(_state["calls_by_booking"].get(booking_id, 0))
        if per_booking_limit > 0 and booking_calls >= per_booking_limit:
            return _build_decision_locked(
                False,
                f"Per-booking RunPod call cap ({per_booking_limit}) reached for this video call.",
                booking_id,
            )

        return _build_decision_locked(True, None, booking_id)


def record_call(booking_id: int, cost_usd: Optional[float] = None) -> BudgetDecision:
    """Mark one RunPod invocation as completed.

    Increments the per-booking call counter and adds an estimated cost to
    today's cumulative spend. If `cost_usd` is None the configured
    `RUNPOD_COST_PER_CALL_USD` estimate is used.

    If recording this call pushes today's spend past the daily budget,
    the daily disable flag is flipped immediately so the *next*
    `check_budget` returns `allowed=False` even before midnight.
    """
    if cost_usd is None:
        cost_usd = float(settings.RUNPOD_COST_PER_CALL_USD)
    cost = max(0.0, float(cost_usd))

    with _lock:
        _ensure_today_locked()
        _state["spend_usd"] += cost
        _state["calls_by_booking"][booking_id] = (
            int(_state["calls_by_booking"].get(booking_id, 0)) + 1
        )

        daily_budget = float(settings.RUNPOD_DAILY_BUDGET_USD)
        if daily_budget > 0 and _state["spend_usd"] >= daily_budget:
            _state["daily_disabled_on_date"] = _state["date"]

        return _build_decision_locked(True, None, booking_id)


def status_snapshot() -> dict:
    """Operator-friendly view of today's RunPod spend + headroom. Wire
    this into a small admin endpoint if you want a live dashboard."""
    with _lock:
        _ensure_today_locked()
        daily_budget = float(settings.RUNPOD_DAILY_BUDGET_USD)
        spend = float(_state["spend_usd"])
        return {
            "enabled": bool(settings.RUNPOD_ENABLED),
            "date_utc": _state["date"],
            "daily_spend_usd": round(spend, 4),
            "daily_budget_usd": daily_budget,
            "daily_remaining_usd": round(max(0.0, daily_budget - spend), 4) if daily_budget > 0 else None,
            "daily_disabled": _state["daily_disabled_on_date"] == _state["date"],
            "active_bookings_today": len(_state["calls_by_booking"]),
            "per_booking_call_limit": int(settings.RUNPOD_PER_BOOKING_CALL_LIMIT),
            "per_call_cost_usd_estimate": float(settings.RUNPOD_COST_PER_CALL_USD),
        }


def reset_for_tests() -> None:
    """Test helper — clear all in-memory state. Not for production use."""
    with _lock:
        _state["date"] = None
        _state["spend_usd"] = 0.0
        _state["calls_by_booking"] = {}
        _state["daily_disabled_on_date"] = None
