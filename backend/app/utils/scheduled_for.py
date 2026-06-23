"""
Parser for the user-friendly `Booking.scheduled_for` string field.

The column is stored as a free-text string like "Friday, 25 Sep - 2:30 PM"
(no year, no timezone). Mirrors `parseScheduledFor` on the clients
(boutique-app/app/(tabs)/index.tsx and frontend-app dashboard) so server
and client agree on the resolved instant.

Conventions:
  • Year is inferred as "this year"; if the resolved date is more than 30
    days in the past, bump to next year (handles late-December scheduling
    for January).
  • Timezone is assumed UTC because that's what the rest of the backend
    runs in. Real users probably enter local time — until `scheduled_for`
    migrates to a typed datetime column with explicit TZ, this is the
    least-surprising default.
  • Returns None on any parse failure so callers can fall back to a
    permissive policy (e.g. let the call through rather than 500 on bad
    legacy data).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional


_MONTH_INDEX = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Matches "Friday, 25 Sep - 2:30 PM" (weekday name optional in match group).
_PATTERN = re.compile(
    r"^[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)$",
    re.IGNORECASE,
)


def parse_scheduled_for(value: Optional[str], *, now: Optional[datetime] = None) -> Optional[datetime]:
    """Return the booking's scheduled instant in UTC, or None if unparsable.

    `now` is exposed so tests can pin the resolution (the year-rollover
    logic depends on it). Production callers should leave it as None.
    """
    if not value:
        return None
    text = value.strip()
    if not text:
        return None

    m = _PATTERN.match(text)
    if not m:
        return None

    day = int(m.group(1))
    month_short = m.group(2).lower()
    hour12 = int(m.group(3))
    minute = int(m.group(4))
    suffix = m.group(5).upper()

    month = _MONTH_INDEX.get(month_short)
    if month is None:
        return None

    hour24 = hour12 % 12
    if suffix == "PM":
        hour24 += 12

    reference = now or datetime.now(timezone.utc)
    year = reference.year

    try:
        candidate = datetime(year, month, day, hour24, minute, tzinfo=timezone.utc)
    except ValueError:
        return None

    # If the candidate is well in the past (>30 days), assume the user meant
    # next year — mirrors the client parser.
    if (reference - candidate).total_seconds() > 30 * 24 * 3600:
        try:
            candidate = datetime(year + 1, month, day, hour24, minute, tzinfo=timezone.utc)
        except ValueError:
            return None

    return candidate
