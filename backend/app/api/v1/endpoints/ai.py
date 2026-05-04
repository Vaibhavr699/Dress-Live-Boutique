from __future__ import annotations

import base64
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


# In-memory rate limiter: booking_id → monotonic timestamp of last accepted request.
# Pruned on each request to prevent unbounded growth.
_live_tryon_last_request: dict[int, float] = {}
_LIVE_TRYON_MIN_INTERVAL_SECONDS = 3.0


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


def _extract_runpod_image_data_url(payload: Any) -> Optional[str]:
    if isinstance(payload, str):
        candidate = payload.strip()
        if candidate.startswith("data:image/"):
            return candidate
        return None

    if isinstance(payload, dict):
        for key in (
            "image_data_url",
            "result_image_data_url",
            "output_image_data_url",
            "image",
            "result_image",
            "data_url",
        ):
            candidate = payload.get(key)
            if isinstance(candidate, str) and candidate.strip().startswith("data:image/"):
                return candidate.strip()

        for key in ("output", "result"):
            nested = payload.get(key)
            extracted = _extract_runpod_image_data_url(nested)
            if extracted:
                return extracted

    if isinstance(payload, list):
        for item in payload:
            extracted = _extract_runpod_image_data_url(item)
            if extracted:
                return extracted

    return None


def _runpod_tryon_enabled() -> bool:
    return bool((settings.RUNPOD_API_KEY or "").strip() and (settings.RUNPOD_TRYON_ENDPOINT_ID or "").strip())


def _render_tryon_via_runpod(
    *,
    dress_id: int,
    dress_name: str | None,
    garment_url: str,
    garment_image_bytes: bytes,
    full_body_image_bytes: bytes,
    selfie_image_bytes: bytes | None = None,
) -> tuple[str, dict[str, Any]]:
    endpoint_id = (settings.RUNPOD_TRYON_ENDPOINT_ID or "").strip()
    api_key = (settings.RUNPOD_API_KEY or "").strip()
    if not endpoint_id or not api_key:
        raise HTTPException(status_code=500, detail="RunPod AI try-on is not configured.")

    request_body = {
        "input": {
            "task": "virtual-tryon",
            "dress_id": dress_id,
            "dress_name": dress_name or "",
            "garment_source_url": garment_url,
            "garment_image_data_url": _encode_image_bytes_data_url(garment_image_bytes, "image/png"),
            "full_body_image_data_url": _encode_image_bytes_data_url(full_body_image_bytes, "image/jpeg"),
            "selfie_image_data_url": (
                _encode_image_bytes_data_url(selfie_image_bytes, "image/jpeg") if selfie_image_bytes else None
            ),
            "return_format": "data_url",
        }
    }

    try:
        response = httpx.post(
            f"https://api.runpod.ai/v2/{endpoint_id}/runsync",
            json=request_body,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=float(settings.RUNPOD_TRYON_TIMEOUT_SECONDS or 90),
        )
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"RunPod AI try-on is unavailable: {e}")

    try:
        payload = response.json()
    except Exception:
        raise HTTPException(status_code=502, detail="RunPod AI try-on returned an unreadable response.")

    image_data_url = _extract_runpod_image_data_url(payload)
    if not image_data_url:
        raise HTTPException(status_code=502, detail="RunPod AI try-on did not return an image.")

    return image_data_url, {
        "renderer": "runpod",
        "runpod_endpoint_id": endpoint_id,
    }


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


def _build_tryon_preview_response(
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
    validation = _validate_full_body_pose(person_img_bgr)
    if not validation.ok:
        raise HTTPException(status_code=400, detail=validation.reason or "Please upload a valid full-body image.")

    # Selfie is accepted for forward compatibility even though the MVP renderer does not yet use it.
    if selfie_image_bytes is not None:
        _ = len(selfie_image_bytes)

    garment_url = (dress.ai_model_url or dress.image_url or "").strip()
    if not garment_url:
        raise HTTPException(status_code=400, detail="This dress does not have an AI garment image yet.")

    garment_bytes = _download_image_bytes(garment_url)
    if _runpod_tryon_enabled():
        image_data_url, preview_details = _render_tryon_via_runpod(
            dress_id=dress.id,
            dress_name=dress.name,
            garment_url=garment_url,
            garment_image_bytes=garment_bytes,
            full_body_image_bytes=full_body_image_bytes,
            selfie_image_bytes=selfie_image_bytes,
        )
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
    return _build_tryon_preview_response(
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
    return _build_tryon_preview_response(
        db=db,
        dress_id=payload.dress_id,
        full_body_image_bytes=full_body_image_bytes,
        selfie_image_bytes=selfie_image_bytes,
    )


def _build_live_tryon_response(
    *,
    db: Session,
    dress_id: int,
    frame_image_bytes: bytes,
) -> dict[str, Any]:
    """
    Render a try-on for a live video frame.
    Unlike the pre-booking flow, we skip strict full-body pose validation —
    live camera frames may not satisfy all pose heuristics but are still
    good enough for the dress overlay.
    """
    dress = crud_dress.get(db, id=dress_id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found.")
    if dress.is_ai_enabled is False:
        raise HTTPException(status_code=400, detail="This dress is not enabled for AI try-on.")

    garment_url = (dress.ai_model_url or dress.image_url or "").strip()
    if not garment_url:
        raise HTTPException(status_code=400, detail="This dress does not have an AI garment image yet.")

    garment_bytes = _download_image_bytes(garment_url)

    if _runpod_tryon_enabled():
        image_data_url, preview_details = _render_tryon_via_runpod(
            dress_id=dress.id,
            dress_name=dress.name,
            garment_url=garment_url,
            garment_image_bytes=garment_bytes,
            full_body_image_bytes=frame_image_bytes,
        )
    else:
        person_img_bgr = _decode_image_bytes(frame_image_bytes)
        garment_img = _decode_image_with_alpha(garment_bytes)
        try:
            preview_bgr, preview_details = _compose_tryon_preview(person_img_bgr, garment_img)
        except HTTPException:
            # Person detection failed on this frame — overlay garment at frame center as fallback.
            preview_bgr, preview_details = _compose_tryon_center_fallback(person_img_bgr, garment_img)
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
        "details": preview_details,
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
    Live video call try-on triggered when the consultant switches a dress.

    The buyer's app captures a camera frame, sends it here, and receives a
    dress-applied image back. Skips strict pose validation used in the
    pre-booking flow since live frames are inherently variable.

    Rate-limited to one request per 3 seconds per booking to protect the
    RunPod AI pipeline from being overwhelmed during an active call.
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

    # Prune stale entries (older than 60 s) to keep the dict small
    now = time.monotonic()
    stale = [k for k, v in _live_tryon_last_request.items() if now - v > 60]
    for k in stale:
        _live_tryon_last_request.pop(k, None)

    last = _live_tryon_last_request.get(payload.booking_id, 0.0)
    if now - last < _LIVE_TRYON_MIN_INTERVAL_SECONDS:
        remaining = round(_LIVE_TRYON_MIN_INTERVAL_SECONDS - (now - last), 1)
        raise HTTPException(
            status_code=429,
            detail=f"Try-on is still processing. Please wait {remaining}s before the next frame.",
        )
    _live_tryon_last_request[payload.booking_id] = now

    frame_image_bytes = _decode_data_url_image_bytes(payload.frame_data_url)
    return _build_live_tryon_response(
        db=db,
        dress_id=payload.dress_id,
        frame_image_bytes=frame_image_bytes,
    )

