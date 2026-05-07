import base64
from typing import Optional

import httpx

_BODYGRAM_API_BASE = "https://platform.bodygram.com/api"


def _strip_data_url(data_url: str) -> str:
    if "," in data_url:
        return data_url.split(",", 1)[1]
    return data_url


def _val(raw: dict, *keys: str) -> Optional[float]:
    for key in keys:
        entry = raw.get(key)
        if entry is None:
            continue
        if isinstance(entry, dict):
            v = entry.get("value")
            if v is not None:
                return float(v)
        try:
            return float(entry)
        except (TypeError, ValueError):
            continue
    return None


def _extract_measurements(data: dict) -> dict:
    raw = data.get("measurements") or data
    return {
        "bust_cm": _val(raw, "chest", "bust", "upperChest"),
        "waist_cm": _val(raw, "waist"),
        "hips_cm": _val(raw, "hips", "hip", "lowerHips"),
        "shoulder_cm": _val(raw, "shoulder", "shoulderWidth", "shoulders"),
        "arm_length_cm": _val(raw, "armLength", "arm_length", "sleeveLength", "sleeve"),
    }


async def run_scan(
    *,
    api_key: str,
    org_id: str,
    height_cm: float,
    weight_kg: float,
    front_image_data_url: str,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    side_image_data_url: Optional[str] = None,
) -> dict:
    """
    Submit a body measurement scan to Bodygram.
    Returns a dict with: bust_cm, waist_cm, hips_cm, shoulder_cm, arm_length_cm.
    Raises RuntimeError on API or processing failure.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    body: dict = {
        "height": height_cm,
        "weight": weight_kg,
        "frontImage": _strip_data_url(front_image_data_url),
    }
    if age is not None:
        body["age"] = age
    if gender is not None:
        body["gender"] = gender
    if side_image_data_url:
        body["sideImage"] = _strip_data_url(side_image_data_url)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{_BODYGRAM_API_BASE}/orgs/{org_id}/scans",
            headers=headers,
            json=body,
        )
        try:
            data = resp.json()
        except Exception:
            data = {}

        if not resp.is_success:
            detail = data.get("message") or data.get("error") or resp.text
            raise RuntimeError(f"Bodygram API error {resp.status_code}: {detail}")

    measurements = _extract_measurements(data)
    return measurements
