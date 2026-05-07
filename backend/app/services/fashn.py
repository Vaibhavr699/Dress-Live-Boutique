import asyncio
import base64
import time

import httpx

_FASHN_API_BASE = "https://api.fashn.ai/v1"
_POLL_INTERVAL = 2.0


async def run_tryon(
    *,
    api_key: str,
    person_image_data_url: str,
    garment_image_url: str,
    category: str = "one-pieces",
    timeout_seconds: float = 120.0,
) -> str:
    """Submit a virtual try-on to Fashn AI and poll until complete. Returns result as data URL."""
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.monotonic() + timeout_seconds

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_FASHN_API_BASE}/run",
            headers=headers,
            json={
                "model_name": "tryon-v1.6",
                "inputs": {
                    "model_image": person_image_data_url,
                    "garment_image": garment_image_url,
                    "category": category,
                },
            },
        )
        resp.raise_for_status()
        pred_id = resp.json().get("id")
        if not pred_id:
            raise RuntimeError("Fashn AI did not return a prediction ID.")

        while True:
            if time.monotonic() > deadline:
                raise RuntimeError("Fashn AI try-on timed out.")

            await asyncio.sleep(_POLL_INTERVAL)

            status_resp = await client.get(
                f"{_FASHN_API_BASE}/status/{pred_id}",
                headers=headers,
            )
            status_resp.raise_for_status()
            data = status_resp.json()
            status = data.get("status", "")

            if status == "completed":
                output = data.get("output") or []
                output_url = output[0] if isinstance(output, list) else output
                if not output_url:
                    raise RuntimeError("Fashn AI completed but returned no output image.")
                img_resp = await client.get(output_url)
                img_resp.raise_for_status()
                content_type = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]
                b64 = base64.b64encode(img_resp.content).decode("ascii")
                return f"data:{content_type};base64,{b64}"

            elif status == "failed":
                error = data.get("error", "Unknown error")
                raise RuntimeError(f"Fashn AI try-on failed: {error}")
