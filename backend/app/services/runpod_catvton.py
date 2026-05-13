"""
Client for the CatVTON RunPod Serverless endpoint.

Handles two RunPod modes:
  • `/runsync` — synchronous, single HTTP round-trip, returns final result
    or polls internally up to its own ~60s ceiling. Best for our 1.5–3s
    warm-call workload.
  • `/run` + `/status/{id}` — async submit + poll. Used as fallback when
    `/runsync` returns IN_QUEUE/IN_PROGRESS (which happens during cold
    starts that exceed the runsync window).

Returns the rendered try-on as a `data:image/jpeg;base64,...` URL — the
exact shape the frontend already consumes for the OpenCV path, so the
swap is invisible to the client.

Budget enforcement is the caller's responsibility — wire
`runpod_budget.check_budget()` BEFORE calling here, and `record_call()`
after a successful response.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

import httpx

_RUNPOD_API_BASE = "https://api.runpod.ai/v2"
_POLL_INTERVAL_SECONDS = 1.5


class RunPodCatVTONError(RuntimeError):
    """Raised for any failure in the CatVTON RunPod call path so the
    caller can cleanly fall back to the local OpenCV renderer."""


async def run_tryon(
    *,
    api_key: str,
    endpoint_id: str,
    person_image_data_url: str,
    garment_image_url: Optional[str] = None,
    garment_image_data_url: Optional[str] = None,
    num_inference_steps: int = 25,
    guidance_scale: float = 2.5,
    seed: Optional[int] = None,
    timeout_seconds: float = 120.0,
) -> str:
    """Submit a frame to the CatVTON worker and return the rendered
    image as a data URL.

    Either `garment_image_url` (HTTPS link, worker will fetch) or
    `garment_image_data_url` (inline base64) must be provided. Inline is
    cheaper on bandwidth when the backend already has the bytes warmed
    in its garment cache.
    """
    if not api_key or not endpoint_id:
        raise RunPodCatVTONError("RunPod API key or endpoint ID not configured.")
    if not garment_image_url and not garment_image_data_url:
        raise RunPodCatVTONError("Either garment_image_url or garment_image_data_url is required.")

    payload_input: dict[str, Any] = {
        "task": "virtual-tryon",
        "full_body_image_data_url": person_image_data_url,
        "num_inference_steps": int(num_inference_steps),
        "guidance_scale": float(guidance_scale),
    }
    if garment_image_data_url:
        payload_input["garment_image_data_url"] = garment_image_data_url
    elif garment_image_url:
        payload_input["garment_source_url"] = garment_image_url
    if seed is not None:
        payload_input["seed"] = int(seed)

    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.monotonic() + max(5.0, float(timeout_seconds))

    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds + 5.0)) as client:
        # 1. Try /runsync first — usually returns the result in one shot.
        try:
            resp = await client.post(
                f"{_RUNPOD_API_BASE}/{endpoint_id}/runsync",
                headers=headers,
                json={"input": payload_input},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise RunPodCatVTONError(f"RunPod /runsync request failed: {exc}") from exc

        body = resp.json() or {}
        status = (body.get("status") or "").upper()

        if status == "COMPLETED":
            return _extract_image_data_url(body.get("output"))

        if status in ("FAILED", "CANCELLED", "TIMED_OUT"):
            raise RunPodCatVTONError(
                f"RunPod returned status={status}: {body.get('error') or body.get('output')}"
            )

        # 2. /runsync returned without a final result (cold start blew past
        # its own deadline). Fall back to polling.
        job_id = body.get("id")
        if not job_id:
            raise RunPodCatVTONError(
                f"RunPod /runsync returned no job ID for fallback poll. Body: {body}"
            )

        while True:
            if time.monotonic() > deadline:
                raise RunPodCatVTONError("RunPod CatVTON call timed out before completion.")
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            try:
                status_resp = await client.get(
                    f"{_RUNPOD_API_BASE}/{endpoint_id}/status/{job_id}",
                    headers=headers,
                )
                status_resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise RunPodCatVTONError(f"RunPod status poll failed: {exc}") from exc

            sbody = status_resp.json() or {}
            sstatus = (sbody.get("status") or "").upper()

            if sstatus == "COMPLETED":
                return _extract_image_data_url(sbody.get("output"))
            if sstatus in ("FAILED", "CANCELLED", "TIMED_OUT"):
                raise RunPodCatVTONError(
                    f"RunPod status={sstatus}: {sbody.get('error') or sbody.get('output')}"
                )
            # else IN_QUEUE / IN_PROGRESS — keep polling


def _extract_image_data_url(output: Any) -> str:
    """The handler returns either:
      {"image_data_url": "...", "details": {...}}
      {"error": "..."}
    Lift the data URL out, or raise with the worker's error string.
    """
    if isinstance(output, dict):
        if output.get("error"):
            raise RunPodCatVTONError(f"Worker error: {output['error']}")
        url = output.get("image_data_url")
        if isinstance(url, str) and url.startswith("data:"):
            return url
    raise RunPodCatVTONError(f"Unexpected RunPod output shape: {output!r}")
