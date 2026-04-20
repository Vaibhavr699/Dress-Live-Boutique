from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()


@dataclass
class _PoseValidationResult:
    ok: bool
    reason: Optional[str] = None
    details: Optional[dict[str, Any]] = None


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


@router.post("/validate-full-body", response_model=dict)
async def validate_full_body(file: UploadFile = File(...)) -> Any:
    """
    Validate that the uploaded image contains a full-body person suitable for try-on.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    image_bytes = await file.read()
    img_bgr = _decode_image_bytes(image_bytes)
    result = _validate_full_body_pose(img_bgr)

    return {
        "ok": bool(result.ok),
        "reason": result.reason,
        "details": result.details or {},
    }

