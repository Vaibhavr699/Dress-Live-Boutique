"""OpenAI gpt-image-2 service — synchronous virtual try-on (image edit).

Primary `tryon` provider for the AI Try-On pipeline. Given the customer photo and
the selected dress image, `gpt-image-2`'s image-edit endpoint composites the real
dress onto the person and renders a luxury-bridal studio result in ONE call.

Unlike fal/FASHN this is SYNCHRONOUS: `/v1/images/edits` returns the generated
image (base64) in the response body — there is no webhook. The job_runner calls
`run_tryon` from its sync path (`run_sync_job`).

Guarded on `OPENAI_API_KEY`: callers catch `ProviderNotConfigured` and leave the
job `pending` until the key is configured — mirroring fal.py / fashn.py.

NOTE: gpt-image-2 additionally requires OpenAI *organization verification* and a
non-zero billing limit. Those failures come back as real API errors (403
must-be-verified / billing_hard_limit_reached); we surface the message so the
AIJob.error column is actionable.
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings
from app.utils.storage import upload_bytes

logger = logging.getLogger(__name__)

_OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits"
_OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

# The ChatGPT website silently runs an "AI copilot" that rewrites/expands the
# prompt with concrete visual + photographic detail before the image model ever
# sees it, and post-processes the result — the main reason the same prompt looks
# richer and crisper there than over the raw API. We replicate the rewriter here:
# a vision model looks at THIS dress and emits two enrichment sections (garment
# detail + photographic finish) that we graft onto the locked TRYON_PROMPT. The
# base prompt stays authoritative (identity / dress / taupe-greige background are
# never overridden); the copilot only ADDS concrete richness on top.
_PROMPT_EXPAND_SYSTEM = (
    "You are the prompt copilot for a luxury bridal virtual try-on rendered by an "
    "image-edit model. Look at the dress in the image and output EXACTLY two "
    "sections, with these literal headers and nothing else:\n\n"
    "GARMENT DETAIL (reproduce exactly)\n"
    "One dense paragraph (60-90 words) of concrete, reproducible detail: "
    "silhouette, neckline, sleeves/straps, fabric type and sheen, "
    "lace/embroidery/beadwork patterns and placement, exact color and tone, "
    "train length, transparency, and surface texture.\n\n"
    "PHOTOGRAPHIC FINISH\n"
    "One dense paragraph (50-80 words) directing a real medium-format studio "
    "photograph look: natural skin with visible pores and micro-texture (never "
    "waxy, plastic, airbrushed, or over-smoothed); crisp, high-frequency lace and "
    "thread detail (never blurred, painted, or averaged); three-dimensional light "
    "sculpting on the bodice boning and fabric folds; rich dynamic range with "
    "clean highlight roll-off on the white gown; sharp, editorial, photoreal.\n\n"
    "Rules: describe only the garment and the photographic finish. Do NOT mention "
    "or change the woman's identity, the dress design, the pose, or the "
    "background. No preamble, no styling advice, no extra text."
)


def _expand_prompt(client: httpx.Client, headers: dict, garment_data_url: str) -> str:
    """Best-effort: ask a vision model for the two enrichment sections (garment
    detail + photographic finish) to graft onto the locked prompt.

    Returns the enrichment text, or "" on any failure. Self-contained: the caller
    passes a base64 data URL (no dependency on OpenAI being able to reach our
    storage URLs). Never raises — try-on must not break if the copilot step fails;
    we just fall back to the base prompt.
    """
    payload = {
        "model": settings.OPENAI_PROMPT_MODEL,
        "messages": [
            {"role": "system", "content": _PROMPT_EXPAND_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Enrich the prompt for this dress."},
                    {"type": "image_url", "image_url": {"url": garment_data_url}},
                ],
            },
        ],
        "max_tokens": 420,
    }
    resp = client.post(_OPENAI_CHAT_URL, headers=headers, json=payload)
    resp.raise_for_status()
    body = resp.json()
    choices = body.get("choices") or []
    if not choices:
        return ""
    return (choices[0].get("message", {}).get("content") or "").strip()

# The locked instruction sent with EVERY try-on. One prompt for every user; only
# the two input images vary. Canonical copy + rationale live in
# docs/ai-tryon/gpt-image-2-tryon-prompt.md — keep the two in sync.
TRYON_PROMPT = """Luxury bridal virtual try-on. Reconstruct, do not create.

Place the exact dress from the garment reference onto the exact woman
from the source image. Produce a result indistinguishable from a real
luxury bridal photoshoot.

LOCKED — DO NOT MODIFY
Face, hair, and dress are read-only regions.

This woman. Same face, identity, skin tone, expression, hair color,
hairstyle, body shape, proportions, pose. No beautification.
No new face. No identity drift.

This dress. Same design, silhouette, fabric, color, embroidery, lace,
beadwork, stitching, train, transparency, all details.
No redesign. No reinterpretation. No simplification.

FIT
Dress worn naturally on this body.
Realistic fabric physics, draping, tension, folds, occlusion, and shadows.
Genuinely worn from within, never pasted, overlaid, or composited.

VOLUME PRESERVATION
Preserve the exact skirt volume, fullness, silhouette, and structure
from the garment reference.
The skirt must maintain the same width, shape, projection, and visual
presence as shown in the reference image.
Do not flatten, compress, collapse, narrow, reduce, or pull the skirt
closer to the body.
Preserve the original bridal silhouette, including any internal structure,
crinoline effect, underskirt volume, architectural shape,
or fabric-supported fullness.
The perceived volume of the lower part of the dress must remain identical
to the garment reference.
When fitting the dress to the woman, adapt the dress to the body
without reducing the original volume of the skirt.
A bridal gown must preserve its original silhouette
before preserving body conformity.

PREMIUM PHOTOGRAPHY DIRECTION
Enhance the photograph, never the woman and never the dress.

Exceptional studio lighting quality. Refined light sculpting on the dress.
Luxury editorial depth. Natural subject separation from background.
Premium fabric texture visibility. Elegant shadow transitions.
Realistic light falloff. High-end optical realism.
Professional medium-format camera look. Clean highlight control.
Rich dynamic range. Natural skin rendering.
Ultra-detailed fabric rendering. Subtle cinematic dimensionality.

The image should feel expensive, elegant, and premium.
Create the wow effect through photography alone.

The result should feel like a premium bridal e-commerce campaign shot for a
high-end fashion catalog — the clean, elevated look of Zara and Zalando lookbooks —
with a medium-format studio camera and even, world-class catalog lighting.

The woman is unchanged. The dress is unchanged. Only the photography is elevated.

BACKGROUND
Replace the original background with a premium fashion e-commerce studio backdrop
in warm taupe greige.

Seamless sweep from wall to floor, no visible horizon line.
Soft, even, diffused lighting with a subtle gentle shadow gradient near the floor.
The elegant, minimal, premium e-commerce lookbook background of Zara and Zalando.
No people, no objects, no furniture, no lighting equipment, no light stands,
no windows, no patterns, no text.
Lighting and rendering consistent with the premium photography direction above.

Only the background changes.
The woman and dress remain identical.

OUTPUT
This woman. This dress. Warm taupe greige e-commerce studio. Real photoshoot. No visible AI."""


class ProviderNotConfigured(Exception):
    """Raised when OPENAI_API_KEY is not set."""


def _download(client: httpx.Client, url: str) -> tuple[bytes, str]:
    """Fetch an image URL, returning (bytes, content_type)."""
    resp = client.get(url)
    resp.raise_for_status()
    content_type = resp.headers.get("content-type", "image/png").split(";")[0].strip()
    if not content_type.startswith("image/"):
        content_type = "image/png"
    return resp.content, content_type


def run_tryon(
    *,
    person_image_url: str,
    garment_image_url: str,
    quality: str | None = None,
    timeout_seconds: float | None = None,
) -> str:
    """Composite the dress onto the customer with gpt-image-2 and return a URL.

    Synchronous: downloads both source images, sends them to /v1/images/edits as
    a multipart edit (image[0]=woman, image[1]=dress) with the locked
    `TRYON_PROMPT`, decodes the returned base64 image, uploads it to storage, and
    returns the public URL. The image ORDER matters — the prompt refers to the
    "source image" (woman) first and the "garment reference" (dress) second.

    Raises ProviderNotConfigured if the key is unset (job stays pending), or
    RuntimeError surfacing OpenAI's error body on any API failure (e.g.
    billing_hard_limit_reached / org-not-verified).
    """
    if not settings.OPENAI_API_KEY:
        raise ProviderNotConfigured("OpenAI is not configured (OPENAI_API_KEY unset).")

    quality = quality or settings.OPENAI_IMAGE_QUALITY
    # No timer: gpt-image-2 high quality can run several minutes. A value of 0 (or
    # negative) means "no timeout" — httpx then waits for the response indefinitely.
    timeout_setting = (
        timeout_seconds if timeout_seconds is not None else settings.OPENAI_TIMEOUT_SECONDS
    )
    timeout = None if (timeout_setting is None or timeout_setting <= 0) else timeout_setting
    headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}

    with httpx.Client(timeout=timeout) as client:
        person_bytes, person_ct = _download(client, person_image_url)
        garment_bytes, garment_ct = _download(client, garment_image_url)

        # "Be the copilot": enrich the locked prompt with concrete garment detail
        # AND photographic-finish direction for THIS dress before the edit,
        # mirroring the ChatGPT website's hidden prompt-rewriter. The model emits
        # its own section headers, so we append the whole block. Best-effort — on
        # any failure we keep the base prompt.
        prompt = TRYON_PROMPT
        if settings.OPENAI_TRYON_EXPAND_PROMPT:
            try:
                garment_data_url = (
                    f"data:{garment_ct};base64,{base64.b64encode(garment_bytes).decode()}"
                )
                enrichment = _expand_prompt(client, headers, garment_data_url)
                if enrichment:
                    prompt = f"{TRYON_PROMPT}\n\n{enrichment}"
                    logger.info("tryon prompt expanded (+%d chars)", len(enrichment))
            except Exception as exc:  # pragma: no cover — copilot must never break try-on
                logger.warning("tryon prompt expansion failed, using base prompt: %s", exc)

        # Multipart: repeated `image[]` fields, order = woman then dress.
        files = [
            ("image[]", ("person.png", person_bytes, person_ct)),
            ("image[]", ("garment.png", garment_bytes, garment_ct)),
        ]
        data = {
            "model": settings.OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "quality": quality,
            # Portrait by default — the API otherwise defaults to 1024x1024 square,
            # which crops/flattens a full-body bridal shot. The website picks
            # portrait for you; we match it.
            "size": settings.OPENAI_IMAGE_SIZE,
            "n": "1",
        }
        resp = client.post(_OPENAI_EDITS_URL, headers=headers, data=data, files=files)
        if resp.status_code >= 400:
            # Surface OpenAI's actual error (billing/verification/etc.) verbatim.
            raise RuntimeError(f"OpenAI images/edits {resp.status_code}: {resp.text[:500]}")
        payload = resp.json()

    items = payload.get("data") or []
    b64 = items[0].get("b64_json") if items and isinstance(items[0], dict) else None
    if not b64:
        raise RuntimeError("gpt-image-2 returned no image data.")

    image_bytes = base64.b64decode(b64)
    return upload_bytes(
        data=image_bytes, folder="tryon-openai", content_type="image/png"
    )


# OpenAI-only garment standardization. Old dresses have only a raw `image_url`
# (often the gown on a model with a busy background); when used as the try-on
# reference, gpt-image-2 can't cleanly replace the background and the result is
# poor. This turns that single photo into a clean, plain-background catalog image
# of the SAME dress — the equivalent of the fal/4-angle `standardized_image_url`,
# but produced entirely with gpt-image-2 (no fal).
GARMENT_STANDARDIZE_PROMPT = """Clean studio product image of THIS EXACT dress.
Reconstruct, do not redesign.

Keep the exact same dress: same design, silhouette, fabric, color, lace,
embroidery, beadwork, stitching, train, transparency — every detail identical.
No redesign, no reinterpretation, no simplification.

Present it as a premium e-commerce catalog product shot on an invisible
(ghost-mannequin) form: the gown worn and filled out naturally, with realistic
volume, drape, and structure. No human model, no face, no body, no skin, no hands.

Background: plain, clean, seamless light neutral studio backdrop. Soft, even,
diffused lighting with a gentle grounding shadow. No props, no objects, no people,
no text. Remove the original background entirely.

Sharp, high-resolution, true-to-life fabric texture and crisp lace detail.

OUTPUT: this exact dress, ghost-mannequin, clean neutral studio background.
Catalog-ready. No model. No original background."""


def standardize_garment(
    *,
    image_url: str,
    quality: str | None = None,
    timeout_seconds: float | None = None,
) -> str:
    """Clean a single raw dress photo into a plain-background catalog image.

    Synchronous gpt-image-2 edit: downloads the source image, asks the model to
    re-present the SAME dress on a ghost-mannequin against a clean neutral studio
    backdrop (no model, no original background), uploads the result, and returns
    its public URL — suitable to store as `dress.standardized_image_url`.

    Raises ProviderNotConfigured if the key is unset, or RuntimeError surfacing
    OpenAI's error body on any API failure.
    """
    if not settings.OPENAI_API_KEY:
        raise ProviderNotConfigured("OpenAI is not configured (OPENAI_API_KEY unset).")

    quality = quality or settings.OPENAI_IMAGE_QUALITY
    timeout_setting = (
        timeout_seconds if timeout_seconds is not None else settings.OPENAI_TIMEOUT_SECONDS
    )
    timeout = None if (timeout_setting is None or timeout_setting <= 0) else timeout_setting
    headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}

    with httpx.Client(timeout=timeout) as client:
        img_bytes, img_ct = _download(client, image_url)
        files = [("image[]", ("garment.png", img_bytes, img_ct))]
        data = {
            "model": settings.OPENAI_IMAGE_MODEL,
            "prompt": GARMENT_STANDARDIZE_PROMPT,
            "quality": quality,
            "size": settings.OPENAI_IMAGE_SIZE,
            "n": "1",
        }
        resp = client.post(_OPENAI_EDITS_URL, headers=headers, data=data, files=files)
        if resp.status_code >= 400:
            raise RuntimeError(f"OpenAI images/edits {resp.status_code}: {resp.text[:500]}")
        payload = resp.json()

    items = payload.get("data") or []
    b64 = items[0].get("b64_json") if items and isinstance(items[0], dict) else None
    if not b64:
        raise RuntimeError("gpt-image-2 returned no standardized image.")

    image_bytes = base64.b64decode(b64)
    return upload_bytes(
        data=image_bytes, folder="standardized-openai", content_type="image/png"
    )
