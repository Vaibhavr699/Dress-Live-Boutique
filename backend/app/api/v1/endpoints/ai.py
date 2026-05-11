from __future__ import annotations

import base64
import collections
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud.crud_booking import crud_booking
from app.crud.crud_dress import crud_dress
from app.models.user import User
from app.services import fashn as fashn_service

router = APIRouter()


@dataclass
class _PoseValidationResult:
    ok: bool
    reason: Optional[str] = None
    details: Optional[dict[str, Any]] = None


class FullBodyValidationPayload(BaseModel):
    image_data_url: str


class TryOnPreviewPayload(BaseModel):
    dress_id: int
    full_body_image_data_url: str
    selfie_image_data_url: Optional[str] = None


class LiveTryOnFramePayload(BaseModel):
    booking_id: int
    dress_id: int
    frame_data_url: str
    # 'live' (default) → OpenCV-only, ~1s; 'hd' → Fashn (slow, photo-realistic).
    quality: str = "live"


# In-memory rate limiter, keyed by (booking_id, quality). Live and HD have
# different cadence budgets so a slow Fashn call doesn't block snappy live
# frames (and vice versa). Pruned on every request.
_live_tryon_last_request: dict[tuple[int, str], float] = {}
_LIVE_TRYON_INTERVAL_BY_QUALITY = {
    "live": 1.0,
    "hd": 5.0,
}
_LIVE_TRYON_DEFAULT_INTERVAL = 1.0


def _decode_image_bytes(image_bytes: bytes):
    try:
        import numpy as np
        import cv2
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image. Please upload a valid JPG/PNG.")
    return img_bgr


def _decode_data_url_image_bytes(data_url: str) -> bytes:
    raw = (data_url or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Image data is required.")

    if raw.startswith("data:"):
        if "," not in raw:
            raise HTTPException(status_code=400, detail="Image data is invalid.")
        raw = raw.split(",", 1)[1]

    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image. Please try again.")


def _encode_png_data_url(img_bgr) -> str:
    try:
        import cv2
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    ok, encoded = cv2.imencode(".png", img_bgr)
    if not ok or encoded is None:
        raise HTTPException(status_code=500, detail="Could not encode try-on preview.")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def _encode_jpeg_data_url(img_bgr, quality: int = 80) -> str:
    """JPEG encoder for live overlays — ~3-5x smaller payload than PNG and
    visually identical when composited on top of a video stream."""
    try:
        import cv2
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    ok, encoded = cv2.imencode(
        ".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, int(max(1, min(100, quality)))]
    )
    if not ok or encoded is None:
        raise HTTPException(status_code=500, detail="Could not encode try-on preview.")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def _encode_image_bytes_data_url(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image data is required.")
    payload = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{payload}"


def _download_image_bytes(url: str) -> bytes:
    try:
        response = httpx.get(url, timeout=20.0)
        response.raise_for_status()
        return response.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not load dress image for AI try-on: {e}")


# Garment bytes are heavy to re-download every frame during a live call.
# Keep a small in-process LRU keyed by URL; entries are invalidated after
# `_GARMENT_CACHE_TTL_SECONDS` so dress edits propagate within a minute.
_GARMENT_CACHE_MAX = 64
_GARMENT_CACHE_TTL_SECONDS = 60.0
_garment_cache: "collections.OrderedDict[str, tuple[float, bytes]]" = collections.OrderedDict()


def _get_garment_bytes_cached(url: str) -> bytes:
    if not url:
        raise HTTPException(status_code=400, detail="Missing garment image URL.")
    now = time.monotonic()
    cached = _garment_cache.get(url)
    if cached is not None:
        ts, content = cached
        if now - ts <= _GARMENT_CACHE_TTL_SECONDS:
            _garment_cache.move_to_end(url)
            return content
        _garment_cache.pop(url, None)
    content = _download_image_bytes(url)
    _garment_cache[url] = (now, content)
    _garment_cache.move_to_end(url)
    while len(_garment_cache) > _GARMENT_CACHE_MAX:
        _garment_cache.popitem(last=False)
    return content


def _fashn_tryon_enabled() -> bool:
    return bool((settings.FASHN_API_KEY or "").strip())


def _resize_image_bytes_for_tryon(image_bytes: bytes, max_side: int = 768) -> bytes:
    """Downscale to max_side px on the longest dimension before sending to an external AI API.

    A full phone photo is 3–5 MB as base64. Resizing to 768 px keeps it under
    200 KB while preserving enough detail for garment overlay.
    """
    try:
        import cv2
        import numpy as np
    except Exception:
        return image_bytes

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes

    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return image_bytes

    scale = max_side / max(h, w)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 82])
    if not ok:
        return image_bytes
    return buf.tobytes()


def _decode_image_with_alpha(image_bytes: bytes):
    try:
        import numpy as np
        import cv2
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode dress image for AI try-on.")
    return img


def _detect_primary_person_bbox(img_bgr) -> Optional[tuple[int, int, int, int]]:
    try:
        import cv2
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    boxes, weights = hog.detectMultiScale(
        img_bgr,
        winStride=(8, 8),
        padding=(8, 8),
        scale=1.05,
    )
    if len(boxes) == 0:
        return None

    ranked = sorted(
        [
            {
                "box": (int(x), int(y), int(w), int(h)),
                "weight": float(weights[i]) if len(weights) > i else 0.0,
                "area": int(w) * int(h),
            }
            for i, (x, y, w, h) in enumerate(boxes)
        ],
        key=lambda item: (item["weight"], item["area"]),
        reverse=True,
    )
    return ranked[0]["box"]


def _extract_garment_rgba(garment_img):
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    if garment_img.ndim == 2:
        garment_bgr = cv2.cvtColor(garment_img, cv2.COLOR_GRAY2BGR)
        alpha = np.full(garment_img.shape[:2], 255, dtype=np.uint8)
    elif garment_img.shape[2] == 4:
        garment_bgr = garment_img[:, :, :3]
        alpha = garment_img[:, :, 3]
    else:
        garment_bgr = garment_img[:, :, :3]
        gray = cv2.cvtColor(garment_bgr, cv2.COLOR_BGR2GRAY)
        alpha = cv2.threshold(gray, 245, 255, cv2.THRESH_BINARY_INV)[1]
        alpha = cv2.GaussianBlur(alpha, (7, 7), 0)
        alpha = cv2.normalize(alpha, None, 0, 255, cv2.NORM_MINMAX)

    return garment_bgr, alpha


def _compose_tryon_pose_warp(person_img_bgr, garment_img) -> tuple[Any, dict[str, Any]]:
    """
    Phase 3 renderer: use MediaPipe pose landmarks (shoulders + hips) to build
    a perspective transform that warps the garment onto the body. Much better
    than the HOG bbox fit when the body is not perfectly facing the camera.

    Raises HTTPException if MediaPipe is unavailable or no pose is detected;
    callers should fall back to _compose_tryon_preview / center fallback.
    """
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    try:
        import mediapipe as mp
    except Exception:
        raise HTTPException(status_code=400, detail="Pose-warp unavailable on this server.")

    if not hasattr(mp, "solutions"):
        raise HTTPException(status_code=400, detail="Pose-warp unavailable on this server.")

    h, w = person_img_bgr.shape[:2]
    if h < 64 or w < 64:
        raise HTTPException(status_code=400, detail="Frame too small for pose-warp.")

    img_rgb = person_img_bgr[:, :, ::-1]
    mp_pose = mp.solutions.pose
    # Lightest pose model for low-latency real-time use.
    with mp_pose.Pose(
        static_image_mode=True,
        model_complexity=0,
        enable_segmentation=False,
        min_detection_confidence=0.3,
        min_tracking_confidence=0.3,
    ) as pose:
        res = pose.process(img_rgb)

    if not res.pose_landmarks or not res.pose_landmarks.landmark:
        raise HTTPException(status_code=400, detail="No person detected for pose-warp.")

    lm = res.pose_landmarks.landmark
    L = mp_pose.PoseLandmark

    def pt(idx) -> tuple[float, float, float]:
        p = lm[idx.value]
        return (float(p.x) * w, float(p.y) * h, float(getattr(p, "visibility", 0.0) or 0.0))

    ls = pt(L.LEFT_SHOULDER)   # left shoulder (subject's left = image right)
    rs = pt(L.RIGHT_SHOULDER)
    lh = pt(L.LEFT_HIP)
    rh = pt(L.RIGHT_HIP)

    # Require all four keypoints with at least modest confidence — otherwise
    # the perspective transform will produce a broken polygon.
    min_vis = 0.35
    if min(ls[2], rs[2], lh[2], rh[2]) < min_vis:
        raise HTTPException(status_code=400, detail="Pose keypoints not confident enough for warp.")

    # In MediaPipe naming, LEFT_* refers to the subject's left side (so it
    # appears on the image's RIGHT for a forward-facing buyer). For the warp
    # quadrilateral we want the order (top-left, top-right, bottom-right,
    # bottom-left) in image-space.
    image_left_shoulder = rs[:2]   # subject's right shoulder → image left
    image_right_shoulder = ls[:2]
    image_left_hip = rh[:2]
    image_right_hip = lh[:2]

    # Expand the quad outward a bit so the dress falls on the body, not
    # purely between the joint centers.
    shoulder_dx = image_right_shoulder[0] - image_left_shoulder[0]
    body_h = ((image_left_hip[1] + image_right_hip[1]) / 2.0) - ((image_left_shoulder[1] + image_right_shoulder[1]) / 2.0)
    if shoulder_dx <= 0 or body_h <= 0:
        raise HTTPException(status_code=400, detail="Pose geometry invalid for warp.")

    expand_x = shoulder_dx * 0.18  # widen by ~18% on each side
    expand_top = body_h * 0.06     # nudge the dress up a touch above shoulders
    expand_bottom = body_h * 0.55  # extend dress past hips toward mid-thigh

    dst_tl = (image_left_shoulder[0] - expand_x, image_left_shoulder[1] - expand_top)
    dst_tr = (image_right_shoulder[0] + expand_x, image_right_shoulder[1] - expand_top)
    dst_br = (image_right_hip[0] + expand_x, image_right_hip[1] + expand_bottom)
    dst_bl = (image_left_hip[0] - expand_x, image_left_hip[1] + expand_bottom)

    # Source quad: assume a standard product photo where the garment occupies
    # roughly the middle 65% horizontally and runs from ~10% to ~75% vertically.
    garment_bgr, garment_alpha = _extract_garment_rgba(garment_img)
    g_h, g_w = garment_bgr.shape[:2]
    if g_h <= 0 or g_w <= 0:
        raise HTTPException(status_code=400, detail="Selected dress image is not usable for AI try-on.")

    src_tl = (g_w * 0.18, g_h * 0.10)
    src_tr = (g_w * 0.82, g_h * 0.10)
    src_br = (g_w * 0.82, g_h * 0.75)
    src_bl = (g_w * 0.18, g_h * 0.75)

    src = np.array([src_tl, src_tr, src_br, src_bl], dtype=np.float32)
    dst = np.array([dst_tl, dst_tr, dst_br, dst_bl], dtype=np.float32)

    M = cv2.getPerspectiveTransform(src, dst)
    warped_garment = cv2.warpPerspective(garment_bgr, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    warped_alpha = cv2.warpPerspective(garment_alpha, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    # Slight feather to reduce hard edges from the warp.
    warped_alpha = cv2.GaussianBlur(warped_alpha, (5, 5), 0)

    alpha_mask = (warped_alpha.astype(np.float32) / 255.0)[..., None]
    result = person_img_bgr.astype(np.float32) * (1.0 - alpha_mask) + warped_garment.astype(np.float32) * alpha_mask
    result = np.clip(result, 0, 255).astype(np.uint8)

    return result, {
        "renderer": "local_pose_warp",
        "keypoint_visibility": {
            "left_shoulder": ls[2],
            "right_shoulder": rs[2],
            "left_hip": lh[2],
            "right_hip": rh[2],
        },
    }


def _compose_tryon_preview(person_img_bgr, garment_img) -> tuple[Any, dict[str, Any]]:
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    bbox = _detect_primary_person_bbox(person_img_bgr)
    if not bbox:
        raise HTTPException(status_code=400, detail="Could not locate the person well enough for try-on preview.")

    x, y, w, h = bbox
    garment_bgr, garment_alpha = _extract_garment_rgba(garment_img)
    g_h, g_w = garment_bgr.shape[:2]
    if g_h <= 0 or g_w <= 0:
        raise HTTPException(status_code=400, detail="Selected dress image is not usable for AI try-on.")

    target_width = max(120, int(w * 0.78))
    target_height = int(target_width * (g_h / max(g_w, 1)))
    min_height = int(h * 0.45)
    max_height = int(h * 0.88)
    target_height = max(min_height, min(target_height, max_height))
    target_width = max(100, int(target_height * (g_w / max(g_h, 1))))

    overlay_x = int(x + (w - target_width) / 2)
    overlay_y = int(y + h * 0.16)
    overlay_x = max(0, min(overlay_x, person_img_bgr.shape[1] - target_width))
    overlay_y = max(0, min(overlay_y, person_img_bgr.shape[0] - target_height))

    resized_garment = cv2.resize(garment_bgr, (target_width, target_height), interpolation=cv2.INTER_AREA)
    resized_alpha = cv2.resize(garment_alpha, (target_width, target_height), interpolation=cv2.INTER_AREA)
    alpha_mask = (resized_alpha.astype(np.float32) / 255.0)[..., None]

    result = person_img_bgr.copy()
    roi = result[overlay_y : overlay_y + target_height, overlay_x : overlay_x + target_width].astype(np.float32)
    garment_f = resized_garment.astype(np.float32)

    # Slightly dim the base ROI under the garment so the result looks more intentional.
    roi = roi * (1.0 - alpha_mask * 0.18)
    blended = garment_f * alpha_mask + roi * (1.0 - alpha_mask)
    result[overlay_y : overlay_y + target_height, overlay_x : overlay_x + target_width] = blended.astype(np.uint8)

    return result, {
        "person_box": {"x": x, "y": y, "width": w, "height": h},
        "overlay_box": {
            "x": overlay_x,
            "y": overlay_y,
            "width": target_width,
            "height": target_height,
        },
    }


def _validate_full_body_hog(img_bgr) -> _PoseValidationResult:
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    h, w = img_bgr.shape[:2]
    if h < 256 or w < 256:
        return _PoseValidationResult(ok=False, reason="Image is too small. Please take a clearer full-body photo.")

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    boxes, weights = hog.detectMultiScale(
        img_bgr,
        winStride=(8, 8),
        padding=(8, 8),
        scale=1.05,
    )

    if len(boxes) == 0:
        return _PoseValidationResult(
            ok=False,
            reason="No person detected. Please retake the photo with your full body in view.",
        )

    ranked = sorted(
        [
            {
                "box": (int(x), int(y), int(bw), int(bh)),
                "weight": float(weights[i]) if len(weights) > i else 0.0,
                "area": int(bw) * int(bh),
            }
            for i, (x, y, bw, bh) in enumerate(boxes)
        ],
        key=lambda item: (item["weight"], item["area"]),
        reverse=True,
    )
    best = ranked[0]
    x, y, bw, bh = best["box"]

    height_ratio = bh / float(h) if h else 0.0
    width_ratio = bw / float(w) if w else 0.0
    margin_x = min(x, max(0, w - (x + bw))) / float(w) if w else 0.0
    top_margin = y / float(h) if h else 0.0
    bottom_margin = max(0, h - (y + bh)) / float(h) if h else 0.0

    if height_ratio < 0.55:
        return _PoseValidationResult(
            ok=False,
            reason="Move farther back. Your full body should fill most of the frame.",
            details={"height_ratio": height_ratio, "width_ratio": width_ratio},
        )
    if margin_x < 0.03:
        return _PoseValidationResult(
            ok=False,
            reason="You're too close to the edge of the frame. Center your body and try again.",
            details={"margin_x": margin_x, "height_ratio": height_ratio},
        )
    if top_margin > 0.18:
        return _PoseValidationResult(
            ok=False,
            reason="Move the camera up slightly so your full body is visible from head to feet.",
            details={"top_margin": top_margin, "height_ratio": height_ratio},
        )
    if bottom_margin < 0.01:
        return _PoseValidationResult(
            ok=False,
            reason="Your feet are too close to the bottom edge. Step back a little and retake the photo.",
            details={"bottom_margin": bottom_margin, "height_ratio": height_ratio},
        )

    return _PoseValidationResult(
        ok=True,
        details={
            "detector": "hog",
            "height_ratio": height_ratio,
            "width_ratio": width_ratio,
            "margin_x": margin_x,
            "top_margin": top_margin,
            "bottom_margin": bottom_margin,
        },
    )


def _validate_human_present(img_bgr) -> _PoseValidationResult:
    """
    Loose validation: only checks that *a* person is detectable in the image.
    Used by the AI try-on preview path so users can pick any photo with a human
    (selfie, half-body, full-body) without being rejected for framing.

    Falls back to "ok" on detector errors so we never block rendering on a
    transient MediaPipe issue — Fashn AI will surface its own error if the
    image is unusable.
    """
    try:
        import mediapipe as mp
    except Exception:
        return _PoseValidationResult(ok=True)

    h, w = img_bgr.shape[:2]
    if h < 64 or w < 64:
        return _PoseValidationResult(ok=False, reason="Image is too small. Please pick a larger photo.")

    if not hasattr(mp, "solutions"):
        return _PoseValidationResult(ok=True)

    try:
        img_rgb = img_bgr[:, :, ::-1]
        mp_pose = mp.solutions.pose
        with mp_pose.Pose(
            static_image_mode=True,
            model_complexity=0,
            enable_segmentation=False,
            min_detection_confidence=0.3,
            min_tracking_confidence=0.3,
        ) as pose:
            res = pose.process(img_rgb)
        if not res.pose_landmarks or not res.pose_landmarks.landmark:
            return _PoseValidationResult(
                ok=False,
                reason="No person detected in the photo. Please pick a photo that clearly shows a person.",
            )
        return _PoseValidationResult(ok=True)
    except Exception:
        # If detection fails for any reason, don't block the render.
        return _PoseValidationResult(ok=True)


def _validate_full_body_pose(img_bgr) -> _PoseValidationResult:
    """
    Validate that image contains a single, mostly full-body person.

    Uses MediaPipe Pose keypoints and a few practical heuristics:
    - shoulders + hips visible (basic pose)
    - knees + ankles visible (full body)
    - enough landmark visibility confidence
    - person occupies enough height in the frame
    """
    try:
        import mediapipe as mp
    except Exception:
        return _validate_full_body_hog(img_bgr)

    h, w = img_bgr.shape[:2]
    if h < 256 or w < 256:
        return _PoseValidationResult(ok=False, reason="Image is too small. Please take a clearer full-body photo.")

    if not hasattr(mp, "solutions"):
        return _validate_full_body_hog(img_bgr)

    img_rgb = img_bgr[:, :, ::-1]  # BGR -> RGB

    mp_pose = mp.solutions.pose
    with mp_pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        res = pose.process(img_rgb)

    if not res.pose_landmarks or not res.pose_landmarks.landmark:
        return _PoseValidationResult(
            ok=False,
            reason="No person detected. Please retake the photo with your full body in view.",
        )

    lm = res.pose_landmarks.landmark
    # MediaPipe landmark indices
    # https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
    L = mp_pose.PoseLandmark

    def vis(landmark) -> float:
        v = getattr(landmark, "visibility", None)
        return float(v) if v is not None else 0.0

    required = {
        "left_shoulder": L.LEFT_SHOULDER,
        "right_shoulder": L.RIGHT_SHOULDER,
        "left_hip": L.LEFT_HIP,
        "right_hip": L.RIGHT_HIP,
        "left_knee": L.LEFT_KNEE,
        "right_knee": L.RIGHT_KNEE,
        "left_ankle": L.LEFT_ANKLE,
        "right_ankle": L.RIGHT_ANKLE,
    }

    vis_map = {name: vis(lm[idx.value]) for name, idx in required.items()}
    # Must have at least one side of each joint pair visible enough.
    min_vis = 0.55
    if max(vis_map["left_shoulder"], vis_map["right_shoulder"]) < min_vis:
        return _PoseValidationResult(ok=False, reason="Upper body not visible. Please include your shoulders in the frame.", details={"visibility": vis_map})
    if max(vis_map["left_hip"], vis_map["right_hip"]) < min_vis:
        return _PoseValidationResult(ok=False, reason="Mid body not visible. Please include your hips in the frame.", details={"visibility": vis_map})
    if max(vis_map["left_knee"], vis_map["right_knee"]) < min_vis:
        return _PoseValidationResult(ok=False, reason="Legs not fully visible. Please include your knees in the frame.", details={"visibility": vis_map})
    if max(vis_map["left_ankle"], vis_map["right_ankle"]) < min_vis:
        return _PoseValidationResult(ok=False, reason="Feet not visible. Please include your full body (head to feet).", details={"visibility": vis_map})

    # Compute landmark bounding box for core points to estimate coverage
    pts = []
    for idx in required.values():
        p = lm[idx.value]
        pts.append((float(p.x) * w, float(p.y) * h, vis(p)))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    top = max(0.0, min(ys))
    bottom = min(float(h), max(ys))
    height_ratio = (bottom - top) / float(h) if h else 0.0

    if height_ratio < 0.55:
        return _PoseValidationResult(
            ok=False,
            reason="Move farther back. Your full body should fill most of the frame.",
            details={"height_ratio": height_ratio, "visibility": vis_map},
        )

    # Centering: if core box is too close to edges, likely cropped
    left = max(0.0, min(xs))
    right = min(float(w), max(xs))
    margin_x = min(left, float(w) - right) / float(w) if w else 0.0
    if margin_x < 0.03:
        return _PoseValidationResult(
            ok=False,
            reason="You're too close to the edge of the frame. Center your body and try again.",
            details={"margin_x": margin_x, "height_ratio": height_ratio, "visibility": vis_map},
        )

    return _PoseValidationResult(ok=True, details={"height_ratio": height_ratio, "visibility": vis_map})


def _validate_image_bytes_response(image_bytes: bytes) -> dict[str, Any]:
    img_bgr = _decode_image_bytes(image_bytes)
    result = _validate_full_body_pose(img_bgr)
    return {
        "ok": bool(result.ok),
        "reason": result.reason,
        "details": result.details or {},
    }


async def _build_tryon_preview_response(
    *,
    db: Session,
    dress_id: int,
    full_body_image_bytes: bytes,
    selfie_image_bytes: bytes | None = None,
) -> dict[str, Any]:
    dress = crud_dress.get(db, id=dress_id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found.")
    if dress.is_ai_enabled is False:
        raise HTTPException(status_code=400, detail="This dress is not enabled for AI try-on.")

    person_img_bgr = _decode_image_bytes(full_body_image_bytes)
    validation = _validate_human_present(person_img_bgr)
    if not validation.ok:
        raise HTTPException(status_code=400, detail=validation.reason or "Please pick a photo with a person clearly visible.")

    garment_url = (dress.ai_model_url or dress.image_url or "").strip()
    if not garment_url:
        raise HTTPException(status_code=400, detail="This dress does not have an AI garment image yet.")

    garment_bytes = _download_image_bytes(garment_url)

    if _fashn_tryon_enabled():
        try:
            resized_body = _resize_image_bytes_for_tryon(full_body_image_bytes, max_side=768)
            person_data_url = _encode_image_bytes_data_url(resized_body, "image/jpeg")
            image_data_url = await fashn_service.run_tryon(
                api_key=settings.FASHN_API_KEY,
                person_image_data_url=person_data_url,
                garment_image_url=garment_url,
                timeout_seconds=float(settings.FASHN_TIMEOUT_SECONDS),
            )
            preview_details = {"renderer": "fashn"}
        except Exception as e:
            garment_img = _decode_image_with_alpha(garment_bytes)
            preview_bgr, preview_details = _compose_tryon_preview(person_img_bgr, garment_img)
            image_data_url = _encode_png_data_url(preview_bgr)
            preview_details["fashn_error"] = str(e)
    else:
        garment_img = _decode_image_with_alpha(garment_bytes)
        preview_bgr, preview_details = _compose_tryon_preview(person_img_bgr, garment_img)
        image_data_url = _encode_png_data_url(preview_bgr)

    return {
        "ok": True,
        "dress": {
            "id": dress.id,
            "name": dress.name,
            "image_url": dress.image_url,
            "ai_model_url": dress.ai_model_url,
        },
        "image_data_url": image_data_url,
        "details": {
            "validation": validation.details or {},
            **preview_details,
        },
    }


@router.post("/validate-full-body", response_model=dict)
async def validate_full_body(file: UploadFile = File(...)) -> Any:
    """
    Validate that the uploaded image contains a full-body person suitable for try-on.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    image_bytes = await file.read()
    return _validate_image_bytes_response(image_bytes)


@router.post("/validate-full-body-base64", response_model=dict)
async def validate_full_body_base64(payload: FullBodyValidationPayload) -> Any:
    image_bytes = _decode_data_url_image_bytes(payload.image_data_url)
    return _validate_image_bytes_response(image_bytes)


@router.post("/preview-tryon", response_model=dict)
async def preview_tryon(
    *,
    db: Session = Depends(deps.get_db),
    dress_id: int = Form(...),
    full_body_file: UploadFile = File(...),
    selfie_file: UploadFile | None = File(None),
) -> Any:
    """
    MVP pre-booking AI try-on preview.

    Uses the selected dress image and overlays it onto the customer's validated full-body image.
    This is a practical first milestone before introducing a dedicated GPU virtual try-on pipeline.
    """
    if not full_body_file.content_type or not full_body_file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    image_bytes = await full_body_file.read()
    selfie_image_bytes = await selfie_file.read() if selfie_file is not None else None
    return await _build_tryon_preview_response(
        db=db,
        dress_id=dress_id,
        full_body_image_bytes=image_bytes,
        selfie_image_bytes=selfie_image_bytes,
    )


@router.post("/preview-tryon-base64", response_model=dict)
async def preview_tryon_base64(
    *,
    payload: TryOnPreviewPayload,
    db: Session = Depends(deps.get_db),
) -> Any:
    full_body_image_bytes = _decode_data_url_image_bytes(payload.full_body_image_data_url)
    selfie_image_bytes = (
        _decode_data_url_image_bytes(payload.selfie_image_data_url)
        if payload.selfie_image_data_url
        else None
    )
    return await _build_tryon_preview_response(
        db=db,
        dress_id=payload.dress_id,
        full_body_image_bytes=full_body_image_bytes,
        selfie_image_bytes=selfie_image_bytes,
    )


def _render_local_tryon(frame_image_bytes: bytes, garment_bytes: bytes) -> tuple[Any, dict[str, Any]]:
    """OpenCV-only render path. Returns (bgr_image, details).

    Cascade (best → fallback):
      1. pose-warp (MediaPipe shoulders + hips → perspective transform)
      2. HOG bbox + scaled paste (no perspective)
      3. center paste (no person detection)
    """
    person_img_bgr = _decode_image_bytes(frame_image_bytes)
    garment_img = _decode_image_with_alpha(garment_bytes)
    try:
        return _compose_tryon_pose_warp(person_img_bgr, garment_img)
    except HTTPException:
        pass
    try:
        return _compose_tryon_preview(person_img_bgr, garment_img)
    except HTTPException:
        return _compose_tryon_center_fallback(person_img_bgr, garment_img)


async def _build_live_tryon_response(
    *,
    db: Session,
    dress_id: int,
    frame_image_bytes: bytes,
    quality: str = "live",
) -> dict[str, Any]:
    """
    Render a try-on for a live video frame.

    quality='live' (default): OpenCV-only. ~0.5–1s per frame. Cartoonish but
    snappy enough for continuous video overlay.

    quality='hd': try Fashn first (10–30s, photo-realistic) and fall back to
    OpenCV if Fashn fails. Use this for the "Capture HD preview" / freeze
    frame flow, not for continuous live updates.

    Skips strict full-body pose validation in both paths — live frames are
    inherently variable.
    """
    dress = crud_dress.get(db, id=dress_id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found.")
    if dress.is_ai_enabled is False:
        raise HTTPException(status_code=400, detail="This dress is not enabled for AI try-on.")

    garment_url = (dress.ai_model_url or dress.image_url or "").strip()
    if not garment_url:
        raise HTTPException(status_code=400, detail="This dress does not have an AI garment image yet.")

    garment_bytes = _get_garment_bytes_cached(garment_url)

    if quality == "hd" and _fashn_tryon_enabled():
        try:
            resized_frame = _resize_image_bytes_for_tryon(frame_image_bytes, max_side=768)
            frame_data_url = _encode_image_bytes_data_url(resized_frame, "image/jpeg")
            image_data_url = await fashn_service.run_tryon(
                api_key=settings.FASHN_API_KEY,
                person_image_data_url=frame_data_url,
                garment_image_url=garment_url,
                timeout_seconds=float(settings.FASHN_TIMEOUT_SECONDS),
            )
            preview_details = {"renderer": "fashn"}
        except Exception as e:
            preview_bgr, preview_details = _render_local_tryon(frame_image_bytes, garment_bytes)
            image_data_url = _encode_jpeg_data_url(preview_bgr, quality=85)
            preview_details["fashn_error"] = str(e)
    else:
        # 'live' path — always OpenCV, always JPEG. Sub-second latency.
        preview_bgr, preview_details = _render_local_tryon(frame_image_bytes, garment_bytes)
        image_data_url = _encode_jpeg_data_url(preview_bgr, quality=80)

    return {
        "ok": True,
        "dress": {
            "id": dress.id,
            "name": dress.name,
            "image_url": dress.image_url,
            "ai_model_url": dress.ai_model_url,
        },
        "image_data_url": image_data_url,
        "details": preview_details,
        "quality": "hd" if (quality == "hd" and _fashn_tryon_enabled() and preview_details.get("renderer") == "fashn") else "live",
    }


def _compose_tryon_center_fallback(person_img_bgr, garment_img) -> tuple[Any, dict[str, Any]]:
    """Overlay garment at frame center when HOG person detection fails on a live frame."""
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server missing image dependencies: {e}")

    p_h, p_w = person_img_bgr.shape[:2]
    garment_bgr, garment_alpha = _extract_garment_rgba(garment_img)
    g_h, g_w = garment_bgr.shape[:2]

    target_width = max(100, int(p_w * 0.55))
    target_height = max(100, int(target_width * (g_h / max(g_w, 1))))
    target_height = min(target_height, int(p_h * 0.75))

    overlay_x = max(0, (p_w - target_width) // 2)
    overlay_y = max(0, int(p_h * 0.15))

    resized_garment = cv2.resize(garment_bgr, (target_width, target_height), interpolation=cv2.INTER_AREA)
    resized_alpha = cv2.resize(garment_alpha, (target_width, target_height), interpolation=cv2.INTER_AREA)
    alpha_mask = (resized_alpha.astype(np.float32) / 255.0)[..., None]

    result = person_img_bgr.copy()
    roi = result[overlay_y:overlay_y + target_height, overlay_x:overlay_x + target_width].astype(np.float32)
    blended = resized_garment.astype(np.float32) * alpha_mask + roi * (1.0 - alpha_mask)
    result[overlay_y:overlay_y + target_height, overlay_x:overlay_x + target_width] = blended.astype(np.uint8)

    return result, {
        "renderer": "local_center_fallback",
        "overlay_box": {"x": overlay_x, "y": overlay_y, "width": target_width, "height": target_height},
    }


@router.post("/live-tryon-frame", response_model=dict)
async def live_tryon_frame(
    *,
    payload: LiveTryOnFramePayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Live video call try-on triggered when the consultant switches a dress,
    or by the buyer's auto-capture loop sending fresh frames.

    quality='live' (default) → OpenCV, sub-second response, ~1 frame/s budget.
    quality='hd' → Fashn (photo-realistic), ~5s rate-limit budget; intended
    for an explicit "Capture HD preview" button rather than the live feed.

    Rate-limited per (booking_id, quality) so a slow HD render in flight does
    not block snappy live frames.
    """
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can request live try-on frames.")

    booking = crud_booking.get(db, id=payload.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed for this booking.")
    if booking.appointment_type != "video":
        raise HTTPException(status_code=400, detail="This booking is not a video appointment.")

    quality = (payload.quality or "live").strip().lower()
    if quality not in _LIVE_TRYON_INTERVAL_BY_QUALITY:
        quality = "live"
    interval = _LIVE_TRYON_INTERVAL_BY_QUALITY.get(quality, _LIVE_TRYON_DEFAULT_INTERVAL)

    # Prune stale entries (older than 60 s) to keep the dict small
    now = time.monotonic()
    stale = [k for k, v in _live_tryon_last_request.items() if now - v > 60]
    for k in stale:
        _live_tryon_last_request.pop(k, None)

    rate_key = (payload.booking_id, quality)
    last = _live_tryon_last_request.get(rate_key, 0.0)
    if now - last < interval:
        remaining = round(interval - (now - last), 1)
        raise HTTPException(
            status_code=429,
            detail=f"Try-on is still processing. Please wait {remaining}s before the next frame.",
        )
    _live_tryon_last_request[rate_key] = now

    frame_image_bytes = _decode_data_url_image_bytes(payload.frame_data_url)
    return await _build_live_tryon_response(
        db=db,
        dress_id=payload.dress_id,
        frame_image_bytes=frame_image_bytes,
        quality=quality,
    )

