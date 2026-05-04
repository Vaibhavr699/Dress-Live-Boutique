import base64
from io import BytesIO
from typing import Any

import numpy as np
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
    except Exception as exc:
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


def _detect_torso_box_mediapipe(img_w: int, img_h: int, img_rgb: np.ndarray) -> tuple[int, int, int, int] | None:
    """Use MediaPipe pose to find shoulder + hip landmarks and derive dress placement box."""
    try:
        import mediapipe as mp
        mp_pose = mp.solutions.pose
        with mp_pose.Pose(static_image_mode=True, model_complexity=1, min_detection_confidence=0.3) as pose:
            result = pose.process(img_rgb)
        if not result.pose_landmarks:
            return None

        lm = result.pose_landmarks.landmark
        L = mp_pose.PoseLandmark

        def lmx(idx): return int(lm[idx.value].x * img_w)
        def lmy(idx): return int(lm[idx.value].y * img_h)
        def vis(idx): return getattr(lm[idx.value], "visibility", 0.0) or 0.0

        # Need shoulders visible
        if max(vis(L.LEFT_SHOULDER), vis(L.RIGHT_SHOULDER)) < 0.3:
            return None

        ls_x, ls_y = lmx(L.LEFT_SHOULDER), lmy(L.LEFT_SHOULDER)
        rs_x, rs_y = lmx(L.RIGHT_SHOULDER), lmy(L.RIGHT_SHOULDER)
        shoulder_y = min(ls_y, rs_y)
        shoulder_cx = (ls_x + rs_x) // 2
        shoulder_span = max(abs(rs_x - ls_x), 40)

        # Use hips if visible, else estimate
        if max(vis(L.LEFT_HIP), vis(L.RIGHT_HIP)) > 0.3:
            hip_y = max(lmy(L.LEFT_HIP), lmy(L.RIGHT_HIP))
        else:
            hip_y = shoulder_y + int(img_h * 0.35)

        torso_h = max(hip_y - shoulder_y, 40)

        # Dress box: wider than shoulders, taller than torso (full-length dress)
        dress_w = min(int(shoulder_span * 2.0), img_w)
        dress_h = min(int(torso_h * 2.4), img_h - shoulder_y)
        dress_x = max(0, shoulder_cx - dress_w // 2)
        dress_y = max(0, shoulder_y - int(torso_h * 0.04))  # start just at shoulder

        return dress_x, dress_y, dress_w, dress_h
    except Exception:
        return None


def _detect_person_bbox_bg_subtraction(full_body: Image.Image) -> tuple[int, int, int, int] | None:
    """Fallback: bounding box of non-white/non-transparent pixels (studio photos)."""
    try:
        arr = np.array(full_body.convert("RGBA"))
        rgb, alpha = arr[:, :, :3], arr[:, :, 3]
        is_fg = ~(np.all(rgb > 230, axis=2) | (alpha < 30))
        rows = np.any(is_fg, axis=1)
        cols = np.any(is_fg, axis=0)
        if not np.any(rows) or not np.any(cols):
            return None
        r0, r1 = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
        c0, c1 = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
        return c0, r0, c1 - c0, r1 - r0
    except Exception:
        return None


def _ensure_visible_alpha(garment: Image.Image) -> Image.Image:
    if garment.mode != "RGBA":
        garment = garment.convert("RGBA")
    alpha = garment.getchannel("A")
    if alpha.getextrema() == (255, 255):
        luminance = ImageOps.grayscale(garment.convert("RGB"))
        generated_alpha = luminance.point(lambda px: 0 if px > 245 else 255)
        generated_alpha = generated_alpha.filter(ImageFilter.GaussianBlur(radius=2))
        garment.putalpha(generated_alpha)
    return garment


def _compose_preview(full_body: Image.Image, garment: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    base = full_body.convert("RGBA")
    garment = _ensure_visible_alpha(garment)
    base_w, base_h = base.size
    g_w, g_h = garment.size
    if base_w <= 0 or base_h <= 0 or g_w <= 0 or g_h <= 0:
        raise ValueError("Images are not usable for try-on.")

    img_rgb = np.array(base.convert("RGB"))
    detector = "fixed"

    # 1. MediaPipe pose landmarks (best accuracy)
    box = _detect_torso_box_mediapipe(base_w, base_h, img_rgb)
    if box:
        detector = "mediapipe"
    else:
        # 2. Background subtraction (studio/white-bg photos)
        person = _detect_person_bbox_bg_subtraction(base)
        if person:
            px, py, pw, ph = person
            head_h = int(ph * 0.18)
            shoulder_y = py + head_h
            dress_w = int(pw * 0.95)
            dress_h = int(ph * 0.78)
            dress_x = px + (pw - dress_w) // 2
            box = max(0, dress_x), max(0, shoulder_y), dress_w, dress_h
            detector = "bg_subtraction"
        else:
            # 3. Fixed-ratio fallback
            dress_w = max(140, int(base_w * 0.42))
            dress_h = max(int(base_h * 0.30), min(int(dress_w * g_h / max(g_w, 1)), int(base_h * 0.60)))
            dress_w = int(dress_h * g_w / max(g_h, 1))
            box = max(0, (base_w - dress_w) // 2), int(base_h * 0.18), dress_w, dress_h
            detector = "fixed"

    bx, by, bw, bh = box

    # Fit garment into box while preserving aspect ratio
    g_aspect = g_w / max(g_h, 1)
    b_aspect = bw / max(bh, 1)
    if g_aspect > b_aspect:
        target_w = bw
        target_h = max(1, int(target_w / g_aspect))
    else:
        target_h = bh
        target_w = max(1, int(target_h * g_aspect))

    # Center in box
    ox = bx + (bw - target_w) // 2
    oy = by

    # Clamp to image
    ox = max(0, min(ox, base_w - target_w))
    oy = max(0, min(oy, base_h - target_h))
    target_w = min(target_w, base_w - ox)
    target_h = min(target_h, base_h - oy)

    resized = garment.resize((target_w, target_h), Image.LANCZOS)
    result = base.copy()
    result.alpha_composite(resized, (ox, oy))

    return result, {
        "detector": detector,
        "overlay_box": {"x": ox, "y": oy, "width": target_w, "height": target_h},
    }


def _encode_png_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def handler(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("input") or {}
    if payload.get("task") != "virtual-tryon":
        return {"error": "Unsupported task. Expected 'virtual-tryon'."}

    full_body_data_url = payload.get("full_body_image_data_url")
    if not isinstance(full_body_data_url, str) or not full_body_data_url.strip():
        return {"error": f"Missing required field: full_body_image_data_url. Received keys: {list(payload.keys())}"}

    try:
        full_body_image = _load_image_from_data_url(full_body_data_url)
        garment_image = _load_garment_image(payload)
        result_image, details = _compose_preview(full_body_image, garment_image)
        return {
            "image_data_url": _encode_png_data_url(result_image),
            "details": {"renderer": "runpod-v2-pose", **details},
        }
    except Exception as exc:
        return {"error": str(exc)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
