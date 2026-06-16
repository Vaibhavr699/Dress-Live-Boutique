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
_TEXT_TO_IMAGE_MODEL = "fal-ai/flux/schnell"
_FACE_EDIT_MODEL = "fal-ai/nano-banana-2/edit"

# Subtle face polish prompt. Applied ONLY to a cropped face region (the dress is
# never in frame), so it cannot affect the garment. Kept gentle so the person
# still looks like themselves — the client freed the face, not the identity.
FACE_ENHANCE_PROMPT = (
    "Subtle natural makeup and gentle skin retouch on this face: even skin tone, "
    "soft natural foundation, light blush, defined but natural eyes and lashes, "
    "soft lipstick. Keep the same person, same facial features and expression, "
    "photorealistic, no heavy or artificial makeup."
)

# Backdrop prompt for background replacement. Bridal boutique → keep it plain,
# soft and timeless: a seamless neutral studio wall, NOT a flashy set. The
# person+dress are composited on top untouched, so this only describes the wall
# behind them. Explicitly exclude studio equipment / props / strong colours.
BACKGROUND_PROMPT = (
    "Professional fashion catalog studio backdrop in warm taupe greige, seamless "
    "sweep from wall to floor with no visible horizon line, soft even diffused "
    "lighting, subtle gentle shadow gradient near the floor, premium e-commerce "
    "lookbook background like Zara and Zalando, elegant and minimal. No people, "
    "no objects, no furniture, no lighting equipment, no light stands, no "
    "windows, no patterns, no text."
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
    # `output_mask: true` makes BiRefNet return the binary subject mask in the
    # `mask_image` field (white = subject incl. dress).
    body = {"image_url": image_url, "output_mask": True, "output_format": "png"}
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(f"{_FAL_SYNC_BASE}/{_BIREFNET_MODEL}", headers=headers, json=body)
        if resp.status_code >= 400:
            raise RuntimeError(f"BiRefNet {resp.status_code}: {resp.text[:300]}")
        data = resp.json()

    mask = data.get("mask_image") or {}
    mask_url = mask.get("url") if isinstance(mask, dict) else None
    if not mask_url:
        raise RuntimeError("BiRefNet did not return a mask url.")
    return mask_url


def background_mask_url(*, image_url: str) -> str:
    """Produce a mask that marks the BACKGROUND for inpainting.

    BiRefNet returns white = subject (person + dress). The editorial inpaint
    repaints WHITE regions, but we want to repaint the background and PROTECT the
    dress — so we invert the subject mask (background becomes white). Returns a
    public URL to the inverted mask.
    """
    import cv2
    import numpy as np

    from app.utils.storage import upload_bytes

    subject_mask_url = segment_subject_mask(image_url=image_url)
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(subject_mask_url)
        resp.raise_for_status()
        raw = resp.content

    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError("Could not decode the subject mask.")
    inverted = cv2.bitwise_not(img)  # subject->black, background->white
    ok, buf = cv2.imencode(".png", inverted)
    if not ok:
        raise RuntimeError("Could not encode the inverted mask.")
    return upload_bytes(data=buf.tobytes(), folder="tryon-masks", content_type="image/png")


def _generate_background(*, width: int, height: int, timeout_seconds: float = 60.0) -> bytes:
    """Generate a studio backdrop sized to (width, height). Returns PNG/JPEG bytes."""
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured("fal.ai is not configured (FAL_API_KEY unset).")
    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "prompt": BACKGROUND_PROMPT,
        "image_size": {"width": int(width), "height": int(height)},
        "num_images": 1,
        "output_format": "png",
    }
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(f"{_FAL_SYNC_BASE}/{_TEXT_TO_IMAGE_MODEL}", headers=headers, json=body)
        if resp.status_code >= 400:
            raise RuntimeError(f"flux t2i {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        images = data.get("images") or []
        bg_url = images[0].get("url") if images and isinstance(images[0], dict) else None
        if not bg_url:
            raise RuntimeError("Background generation returned no image.")
        bg_resp = client.get(bg_url)
        bg_resp.raise_for_status()
        return bg_resp.content


def _edit_face_crop(face_png: bytes, timeout_seconds: float = 90.0) -> bytes:
    """Send a cropped face to nano-banana edit for subtle makeup; return bytes."""
    if not settings.FAL_API_KEY:
        raise ProviderNotConfigured("fal.ai is not configured (FAL_API_KEY unset).")
    from app.utils.storage import upload_bytes

    crop_url = upload_bytes(data=face_png, folder="tryon-face", content_type="image/png")
    headers = {
        "Authorization": f"Key {settings.FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {"prompt": FACE_ENHANCE_PROMPT, "image_urls": [crop_url]}
    with httpx.Client(timeout=timeout_seconds) as client:
        resp = client.post(f"{_FAL_SYNC_BASE}/{_FACE_EDIT_MODEL}", headers=headers, json=body)
        if resp.status_code >= 400:
            raise RuntimeError(f"face edit {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        images = data.get("images") or []
        out_url = images[0].get("url") if images and isinstance(images[0], dict) else None
        if not out_url:
            raise RuntimeError("Face edit returned no image.")
        return client.get(out_url).content


def enhance_face(*, image_url: str) -> str:
    """Apply subtle makeup/skin polish to the FACE region only, leaving the rest
    of the image (and the dress) untouched.

    Detect the largest frontal face → crop with padding → nano-banana edit on the
    crop → feather-paste it back. The garment is never sent to a generative model,
    so it cannot drift. Returns a public URL (or the original on any failure).
    """
    import os
    import cv2
    import numpy as np

    from app.utils.storage import upload_bytes

    with httpx.Client(timeout=60.0) as client:
        img_bytes = client.get(image_url).content
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError("Could not decode image for face enhancement.")
    h, w = img.shape[:2]

    cascade = cv2.CascadeClassifier(
        os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    )
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        # No detectable face — nothing to enhance, return original unchanged.
        return image_url

    # Largest face, padded by 40% so makeup blends around the jaw/hairline.
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    pad_x, pad_y = int(fw * 0.4), int(fh * 0.4)
    x0, y0 = max(0, fx - pad_x), max(0, fy - pad_y)
    x1, y1 = min(w, fx + fw + pad_x), min(h, fy + fh + pad_y)
    crop = img[y0:y1, x0:x1]

    ok, crop_buf = cv2.imencode(".png", crop)
    if not ok:
        return image_url
    enhanced_bytes = _edit_face_crop(crop_buf.tobytes())
    enhanced = cv2.imdecode(np.frombuffer(enhanced_bytes, np.uint8), cv2.IMREAD_COLOR)
    if enhanced is None:
        return image_url
    enhanced = cv2.resize(enhanced, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)

    # Feathered paste: soft-edged ellipse so the enhanced crop blends in.
    ch, cw = enhanced.shape[:2]
    feather = np.zeros((ch, cw), np.float32)
    cv2.ellipse(feather, (cw // 2, ch // 2), (int(cw * 0.45), int(ch * 0.48)), 0, 0, 360, 1.0, -1)
    feather = cv2.GaussianBlur(feather, (0, 0), sigmaX=cw * 0.06)[:, :, None]
    region = img[y0:y1, x0:x1].astype(np.float32)
    blended = enhanced.astype(np.float32) * feather + region * (1.0 - feather)
    img[y0:y1, x0:x1] = blended.astype(np.uint8)

    ok, out_buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        return image_url
    return upload_bytes(data=out_buf.tobytes(), folder="tryon-face-out", content_type="image/jpeg")


def replace_background(*, image_url: str) -> str:
    """Replace the background of a try-on image with a generated studio backdrop,
    WITHOUT touching the person/dress pixels.

    Pipeline (pure pixel ops — no generative model sees the dress):
      1. BiRefNet → subject mask (person+dress = white)
      2. generate a studio backdrop at the try-on image's dimensions
      3. feather the mask edge, then alpha-composite the ORIGINAL subject pixels
         over the new backdrop.

    Returns a public URL to the composited image. The dress is byte-identical to
    the FASHN output, so it can never drift.
    """
    import cv2
    import numpy as np

    from app.utils.storage import upload_bytes

    # Fetch the try-on image and the subject mask.
    mask_url = segment_subject_mask(image_url=image_url)
    with httpx.Client(timeout=60.0) as client:
        fg_bytes = client.get(image_url).content
        mask_bytes = client.get(mask_url).content

    fg = cv2.imdecode(np.frombuffer(fg_bytes, np.uint8), cv2.IMREAD_COLOR)
    mask = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    if fg is None or mask is None:
        raise RuntimeError("Could not decode try-on image or mask.")

    h, w = fg.shape[:2]
    mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)

    # Generate a backdrop at the same size and decode it.
    bg_bytes = _generate_background(width=w, height=h)
    bg = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
    if bg is None:
        raise RuntimeError("Could not decode generated background.")
    bg = cv2.resize(bg, (w, h), interpolation=cv2.INTER_AREA)

    # Feather the mask edge slightly so the cutout doesn't look harsh, then
    # alpha-blend: result = fg*alpha + bg*(1-alpha). Subject pixels (alpha≈1)
    # stay exactly the FASHN pixels.
    alpha = cv2.GaussianBlur(mask, (0, 0), sigmaX=2).astype(np.float32) / 255.0
    alpha = np.clip(alpha, 0.0, 1.0)[:, :, None]
    out = (fg.astype(np.float32) * alpha + bg.astype(np.float32) * (1.0 - alpha)).astype(np.uint8)

    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("Could not encode composited image.")
    return upload_bytes(data=buf.tobytes(), folder="tryon-composite", content_type="image/jpeg")


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
        if resp.status_code >= 400:
            raise RuntimeError(f"fal inpaint {resp.status_code}: {resp.text[:300]}")
        data = resp.json()

    request_id = data.get("request_id") or data.get("id")
    if not request_id:
        raise RuntimeError("fal did not return a request_id.")
    return request_id
