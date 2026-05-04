import base64
from io import BytesIO
from typing import Any

import requests
import runpod
from PIL import Image, ImageFilter, ImageOps


def _split_data_url(value: str) -> tuple[str, bytes]:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Image data is required.")

    if raw.startswith("data:"):
        if "," not in raw:
            raise ValueError("Image data URL is invalid.")
        header, encoded = raw.split(",", 1)
        mime = header.split(";", 1)[0].replace("data:", "") or "image/png"
    else:
        encoded = raw
        mime = "image/png"

    try:
        return mime, base64.b64decode(encoded, validate=True)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError("Could not decode image data.") from exc


def _load_image_from_data_url(data_url: str) -> Image.Image:
    _, image_bytes = _split_data_url(data_url)
    image = Image.open(BytesIO(image_bytes))
    return ImageOps.exif_transpose(image).convert("RGBA")


def _load_garment_image(payload: dict[str, Any]) -> Image.Image:
    garment_data_url = payload.get("garment_image_data_url")
    if isinstance(garment_data_url, str) and garment_data_url.strip():
        return _load_image_from_data_url(garment_data_url)

    garment_source_url = (payload.get("garment_source_url") or "").strip()
    if not garment_source_url:
        raise ValueError("Garment image is required (garment_image_data_url or garment_source_url).")

    response = requests.get(garment_source_url, timeout=30)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content))
    return ImageOps.exif_transpose(image).convert("RGBA")


def _ensure_visible_alpha(garment: Image.Image) -> Image.Image:
    if garment.mode != "RGBA":
        garment = garment.convert("RGBA")

    alpha = garment.getchannel("A")
    extrema = alpha.getextrema()
    if extrema == (255, 255):
        # Create a softer alpha mask when the source image has no transparency.
        luminance = ImageOps.grayscale(garment.convert("RGB"))
        generated_alpha = luminance.point(lambda px: 0 if px > 245 else 255)
        generated_alpha = generated_alpha.filter(ImageFilter.GaussianBlur(radius=2))
        garment.putalpha(generated_alpha)
    return garment


def _compose_preview(full_body: Image.Image, garment: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    base = full_body.convert("RGBA")
    garment = _ensure_visible_alpha(garment)

    base_width, base_height = base.size
    garment_width, garment_height = garment.size
    if base_width <= 0 or base_height <= 0 or garment_width <= 0 or garment_height <= 0:
        raise ValueError("Images are not usable for try-on.")

    target_width = max(140, int(base_width * 0.42))
    target_height = int(target_width * (garment_height / max(garment_width, 1)))
    target_height = max(int(base_height * 0.30), min(target_height, int(base_height * 0.58)))
    target_width = int(target_height * (garment_width / max(garment_height, 1)))

    overlay_x = max(0, int((base_width - target_width) / 2))
    overlay_y = max(0, int(base_height * 0.18))
    overlay_y = min(overlay_y, max(0, base_height - target_height))

    resized = garment.resize((target_width, target_height), Image.LANCZOS)
    result = base.copy()
    result.alpha_composite(resized, (overlay_x, overlay_y))

    return result, {
        "overlay_box": {
            "x": overlay_x,
            "y": overlay_y,
            "width": target_width,
            "height": target_height,
        }
    }


def _encode_png_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    payload = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def handler(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("input") or {}
    if payload.get("task") != "virtual-tryon":
        return {"error": "Unsupported task. Expected 'virtual-tryon'."}

    full_body_data_url = payload.get("full_body_image_data_url")
    if not isinstance(full_body_data_url, str) or not full_body_data_url.strip():
        received_keys = list(payload.keys())
        return {
            "error": f"Missing required field: full_body_image_data_url. Received keys: {received_keys}"
        }

    try:
        full_body_image = _load_image_from_data_url(full_body_data_url)
        garment_image = _load_garment_image(payload)
        result_image, details = _compose_preview(full_body_image, garment_image)

        return {
            "image_data_url": _encode_png_data_url(result_image),
            "details": {
                "renderer": "runpod-starter-v1",
                **details,
            },
        }
    except Exception as exc:
        return {"error": str(exc)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
