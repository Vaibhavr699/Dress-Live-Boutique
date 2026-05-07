from typing import Optional

import httpx

_BODYGRAM_API_BASE = "https://platform.bodygram.com/api"

# Measurement name → our schema field (values come back in mm, we store cm)
_MEASUREMENT_MAP = {
    "bustGirth": "bust_cm",
    "waistGirth": "waist_cm",
    "hipGirth": "hips_cm",
    "acrossBackShoulderWidth": "shoulder_cm",
    "outerArmLengthR": "arm_length_cm",
}


def _strip_data_url(data_url: str) -> str:
    if "," in data_url:
        return data_url.split(",", 1)[1]
    return data_url


def _extract_measurements(entry: dict) -> dict:
    result: dict = {k: None for k in _MEASUREMENT_MAP.values()}
    for item in entry.get("measurements") or []:
        name = item.get("name")
        if name in _MEASUREMENT_MAP:
            value = item.get("value")
            if value is not None:
                # API returns millimeters; convert to cm
                result[_MEASUREMENT_MAP[name]] = round(float(value) / 10.0, 1)
    return result


async def run_scan(
    *,
    api_key: str,
    org_id: str,
    height_cm: float,
    weight_kg: float,
    front_image_data_url: Optional[str] = None,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    side_image_data_url: Optional[str] = None,
) -> dict:
    """
    Submit a body measurement scan to Bodygram Platform API.

    Uses photoScan mode when both front and side photos are provided;
    falls back to statsEstimations (stats-only) otherwise.

    Returns a dict with: bust_cm, waist_cm, hips_cm, shoulder_cm, arm_length_cm.
    Raises RuntimeError on API or processing failure.
    """
    headers = {
        "Authorization": api_key,  # raw key, no prefix
        "Content-Type": "application/json",
    }

    # Height must be in mm, weight in grams
    height_mm = round(height_cm * 10)
    weight_g = round(weight_kg * 1000)

    if front_image_data_url and side_image_data_url:
        payload = {
            "photoScan": {
                "height": height_mm,
                "weight": weight_g,
                "frontPhoto": _strip_data_url(front_image_data_url),
                "rightPhoto": _strip_data_url(side_image_data_url),
            }
        }
        if age is not None:
            payload["photoScan"]["age"] = age
        if gender is not None:
            payload["photoScan"]["gender"] = gender
    else:
        payload = {
            "statsEstimations": {
                "height": height_mm,
                "weight": weight_g,
            }
        }
        if age is not None:
            payload["statsEstimations"]["age"] = age
        if gender is not None:
            payload["statsEstimations"]["gender"] = gender

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{_BODYGRAM_API_BASE}/orgs/{org_id}/scans",
            headers=headers,
            json=payload,
        )
        try:
            data = resp.json()
        except Exception:
            data = {}

        if not resp.is_success:
            entry = data.get("entry") or {}
            detail = (
                (data.get("error") or {}).get("message")
                or entry.get("errorMessage")
                or resp.text
            )
            raise RuntimeError(f"Bodygram API error {resp.status_code}: {detail}")

        entry = data.get("entry", {})
        if entry.get("status") == "failure":
            raise RuntimeError(
                f"Bodygram scan failed: {entry.get('errorMessage', 'unknown error')}"
            )

    return _extract_measurements(entry)
