"""fal.ai service — async (queue + webhook) submit calls.

Currently exposes FLUX Kontext Pro for Step-1 standardization. The call is
SUBMIT-AND-RETURN: we post to fal's queue with a `fal_webhook` URL and get back a
`request_id`; fal later calls our `/api/v1/webhooks/fal` endpoint with the result.
No held HTTP connection.

Guarded on `FAL_API_KEY`: callers (job_runner) catch `ProviderNotConfigured` and
leave the job pending until the key is configured. This mirrors how the FASHN
integration guards on its key.
"""

from __future__ import annotations

import httpx

from app.core.config import settings

_FAL_QUEUE_BASE = "https://queue.fal.run"
_FAL_SYNC_BASE = "https://fal.run"
_KONTEXT_MODEL = "fal-ai/flux-pro/kontext"
_BIREFNET_MODEL = "fal-ai/birefnet"
_TOPAZ_MODEL = "fal-ai/topaz/upscale/image"
# Inpaint model used for the editorial pass — repaints the non-dress region
# (background / skin / lighting) while the masked dress is preserved.
_INPAINT_MODEL = "fal-ai/flux-pro/kontext/max"

# Editorial pass prompt. The dress is masked, so this only affects the scene.
EDITORIAL_PROMPT = (
    "Editorial fashion photograph. Studio lighting, clean professional background, "
    "natural skin, confident posture, magazine catalog quality. Do not alter the "
    "dress in any way."
)

# Garment-locking prompt. The whole point of standardization is that the dress is
# never reinterpreted — only cleaned up into a catalog product shot.
STANDARDIZE_PROMPT = (
    "Studio ghost-mannequin product photo of this dress on a plain white "
    "background. Do not change the dress color, shape, fabric, lace, embroidery, "
    "beading, train, or length. Centered, even lighting, e-commerce catalog style."
)


class ProviderNotConfigured(Exception):
    """Raised when FAL_API_KEY is not set."""


def submit_kontext(
    *,
    image_url: str,
    webhook_url: str,
    prompt: str | None = None,
    timeout_seconds: float = 30.0,
) -> str:
    """Submit a FLUX Kontext Pro edit to fal's queue. Returns the fal request_id.

    The result is delivered later to `webhook_url` (our fal webhook receiver),
    which records it on the AIJob.
    """
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured(
            "fal.ai is not configured (FAL_API_KEY unset)."
        )

    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    params = {"fal_webhook": webhook_url}
    body = {"prompt": prompt or STANDARDIZE_PROMPT, "image_url": image_url}

    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(
            f"{_FAL_QUEUE_BASE}/{_KONTEXT_MODEL}",
            headers=headers,
            params=params,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    request_id = data.get("request_id") or data.get("id")
    if not request_id:
        raise RuntimeError("fal did not return a request_id.")
    return request_id


def upscale_topaz(*, image_url: str, timeout_seconds: float = 120.0) -> str:
    """Upscale/enhance an image with Topaz (sync). Returns the enhanced image URL.

    Called synchronously by the finishing step — Topaz returns the result in the
    response, so no webhook hop is needed.
    """
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured("fal.ai is not configured (FAL_API_KEY unset).")

    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(
            f"{_FAL_SYNC_BASE}/{_TOPAZ_MODEL}",
            headers=headers,
            json={"image_url": image_url},
        )
        resp.raise_for_status()
        data = resp.json()

    image = data.get("image") or {}
    url = image.get("url") if isinstance(image, dict) else None
    if not url:
        # some fal models return `images:[{url}]`
        images = data.get("images")
        if isinstance(images, list) and images and isinstance(images[0], dict):
            url = images[0].get("url")
    if not url:
        raise RuntimeError("Topaz did not return an image url.")
    return url


def segment_subject_mask(*, image_url: str, timeout_seconds: float = 60.0) -> str:
    """Run BiRefNet synchronously and return the subject mask image URL.

    Used by the Approach-A editorial pass to locate the dress/subject so the
    polish can be confined to the background. Small/fast, so we call it sync
    (no webhook) rather than adding a webhook hop.
    """
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured("fal.ai is not configured (FAL_API_KEY unset).")

    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {"image_url": image_url, "mask_only": True, "output_format": "png"}
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(f"{_FAL_SYNC_BASE}/{_BIREFNET_MODEL}", headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

    image = data.get("image") or {}
    mask_url = image.get("url") if isinstance(image, dict) else None
    if not mask_url:
        raise RuntimeError("BiRefNet did not return a mask url.")
    return mask_url


def submit_editorial_inpaint(
    *,
    image_url: str,
    mask_url: str,
    webhook_url: str,
    prompt: str | None = None,
    timeout_seconds: float = 30.0,
) -> str:
    """Submit the editorial inpaint pass to fal's queue. Returns the request_id.

    `mask_url` marks the region to repaint (background/skin/lighting); the dress
    region is preserved. Result is delivered to `webhook_url`.
    """
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured("fal.ai is not configured (FAL_API_KEY unset).")

    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    params = {"fal_webhook": webhook_url}
    body = {
        "prompt": prompt or EDITORIAL_PROMPT,
        "image_url": image_url,
        "mask_image_url": mask_url,
    }
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(
            f"{_FAL_QUEUE_BASE}/{_INPAINT_MODEL}",
            headers=headers,
            params=params,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    request_id = data.get("request_id") or data.get("id")
    if not request_id:
        raise RuntimeError("fal did not return a request_id.")
    return request_id
