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


def _stats_payload(
    *, height_mm: int, weight_g: int, age: Optional[int], gender: Optional[str]
) -> dict:
    body: dict = {"height": height_mm, "weight": weight_g}
    if age is not None:
        body["age"] = age
    if gender is not None:
        body["gender"] = gender
    return {"statsEstimations": body}


def _photo_payload(
    *,
    height_mm: int,
    weight_g: int,
    age: Optional[int],
    gender: Optional[str],
    front_b64: str,
    right_b64: str,
) -> dict:
    body: dict = {
        "height": height_mm,
        "weight": weight_g,
        "frontPhoto": front_b64,
        "rightPhoto": right_b64,
    }
    if age is not None:
        body["age"] = age
    if gender is not None:
        body["gender"] = gender
    return {"photoScan": body}


async def _post_scan(client: httpx.AsyncClient, *, api_key: str, org_id: str, payload: dict) -> tuple[int, dict]:
    resp = await client.post(
        f"{_BODYGRAM_API_BASE}/orgs/{org_id}/scans",
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        json=payload,
    )
    try:
        data = resp.json()
    except Exception:
        data = {}
    return resp.status_code, data


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

    Tries photoScan when both front and side photos are provided. Falls back
    to statsEstimations on photoScan failure (e.g. credit limits, photo
    validation) or when photos are missing.

    Returns a dict with: bust_cm, waist_cm, hips_cm, shoulder_cm, arm_length_cm.
    Raises RuntimeError on terminal failure.
    """
    height_mm = round(height_cm * 10)
    weight_g = round(weight_kg * 1000)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Try photoScan if both photos provided
        if front_image_data_url and side_image_data_url:
            photo_payload = _photo_payload(
                height_mm=height_mm,
                weight_g=weight_g,
                age=age,
                gender=gender,
                front_b64=_strip_data_url(front_image_data_url),
                right_b64=_strip_data_url(side_image_data_url),
            )
            status, data = await _post_scan(client, api_key=api_key, org_id=org_id, payload=photo_payload)
            entry = data.get("entry") or {}
            if status < 400 and entry.get("status") == "success":
                return _extract_measurements(entry)
            # photoScan failed — fall through to statsEstimations as a safety net

        # Stats-only path (also used as photoScan fallback)
        stats_payload = _stats_payload(
            height_mm=height_mm, weight_g=weight_g, age=age, gender=gender
        )
        status, data = await _post_scan(client, api_key=api_key, org_id=org_id, payload=stats_payload)
        entry = data.get("entry") or {}
        if status >= 400:
            detail = (data.get("error") or {}).get("message") or "unknown error"
            raise RuntimeError(f"Bodygram API error {status}: {detail}")
        if entry.get("status") != "success":
            raise RuntimeError(
                f"Bodygram scan failed: {entry.get('errorMessage', 'unknown error')}"
            )

    return _extract_measurements(entry)
