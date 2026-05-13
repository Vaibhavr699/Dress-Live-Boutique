"""
RunPod serverless handler — CatVTON virtual try-on.

Replaces the previous OpenCV/MediaPipe paste-overlay handler. CatVTON is
a single-pass diffusion model that produces photoreal garment-on-person
renders in ~1.5–3s on RTX 4090 (24 GB).

────────────────────────────────────────────────────────────────────────
LICENSING — CatVTON is released under CC BY-NC-SA 4.0 (non-commercial).
For Boutique Portal's commercial use you must either contact the
CatVTON authors for a license, or swap to OOTDiffusion (Apache 2.0,
near-identical handler shape — only the import path and pipeline class
name change).
────────────────────────────────────────────────────────────────────────

Lifecycle on RunPod:
  • Cold start (~60–120s): SD-inpainting base model downloads from HF on
    first invocation (~5GB), then CUDA + pipeline init. Subsequent cold
    starts within the same image generation are fast because the model
    is cached on the worker disk. Enable RunPod FlashBoot to keep workers
    warm across requests.
  • Warm call (~1.5–3s): two image decodes + mask build + diffusion +
    encode. The pipeline object stays in GPU memory between calls.

Inputs (event["input"]):
  task                          str   = "virtual-tryon"  (required)
  full_body_image_data_url      str   data: URL of the customer photo
  garment_image_data_url        str   data: URL of the dress (optional;
                                       use this OR garment_source_url)
  garment_source_url            str   HTTPS URL of the dress image
  num_inference_steps           int   default 25 — lower = faster, less detail
  guidance_scale                float default 2.5 — CatVTON's recommended range
  seed                          int   optional, for reproducibility

Output:
  image_data_url   data:image/jpeg;base64,...  the composited result
  details          {renderer, inference_seconds, steps, guidance_scale}

Or on error:
  error            str  human-readable failure reason
"""

from __future__ import annotations

import base64
import os
import sys
import time
import traceback
from io import BytesIO
from typing import Any, Optional

import numpy as np
import requests
import runpod
import torch
from PIL import Image, ImageDraw, ImageOps


# ── Logging helpers ─────────────────────────────────────────────────────
def _log(msg: str) -> None:
    print(f"[catvton] {msg}", flush=True)


# ── CatVTON pipeline (loaded once at module import) ─────────────────────
# CatVTON has no PyPI package — its source is git-cloned into the Docker
# image at /opt/catvton and added to PYTHONPATH (see Dockerfile). The
# import paths below mirror the CatVTON repo structure as of mid-2025.
# If you bump the CatVTON pin, double-check these still resolve.

try:
    from model.pipeline import CatVTONPipeline  # type: ignore
    from utils import init_weight_dtype  # type: ignore
    _CATVTON_IMPORT_ERROR: Optional[str] = None
except Exception as exc:  # pragma: no cover — only fires if Docker build is wrong
    CatVTONPipeline = None  # type: ignore
    init_weight_dtype = None  # type: ignore
    _CATVTON_IMPORT_ERROR = f"CatVTON modules unavailable: {exc}"
    _log(_CATVTON_IMPORT_ERROR)


_PIPELINE: Optional[Any] = None
_LOAD_ERROR: Optional[str] = None


def _load_pipeline_once() -> Any:
    """Lazy-load the CatVTON pipeline. Called from `handler` AND eagerly
    from `__main__` so the first real request doesn't pay the cold-start
    cost — the worker stays in the 'initializing' state until the model
    is ready."""
    global _PIPELINE, _LOAD_ERROR

    if _PIPELINE is not None:
        return _PIPELINE
    if _LOAD_ERROR is not None:
        raise RuntimeError(f"CatVTON pipeline failed to load earlier: {_LOAD_ERROR}")
    if _CATVTON_IMPORT_ERROR or CatVTONPipeline is None or init_weight_dtype is None:
        _LOAD_ERROR = _CATVTON_IMPORT_ERROR or "CatVTON modules unavailable"
        raise RuntimeError(_LOAD_ERROR)

    base_ckpt = os.environ.get("CATVTON_BASE_MODEL", "booksforcharlie/stable-diffusion-inpainting")
    attn_ckpt = os.environ.get("CATVTON_ATTN_REPO", "/opt/models/catvton")
    precision = os.environ.get("CATVTON_PRECISION", "bf16")

    started = time.monotonic()
    _log(f"loading pipeline base={base_ckpt} attn={attn_ckpt} precision={precision}")
    try:
        _PIPELINE = CatVTONPipeline(
            base_ckpt=base_ckpt,
            attn_ckpt=attn_ckpt,
            attn_ckpt_version="mix",
            weight_dtype=init_weight_dtype(precision),
            use_tf32=True,
            device="cuda",
        )
        _log(f"pipeline ready in {time.monotonic() - started:.1f}s")
        return _PIPELINE
    except Exception as exc:
        _LOAD_ERROR = f"{type(exc).__name__}: {exc}"
        _log(f"pipeline load FAILED: {_LOAD_ERROR}\n{traceback.format_exc()}")
        raise


# ── Image I/O ──────────────────────────────────────────────────────────
def _split_data_url(value: str) -> bytes:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Image data is required.")
    if raw.startswith("data:"):
        if "," not in raw:
            raise ValueError("Image data URL is invalid.")
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError("Could not decode image data.") from exc


def _load_image_from_data_url(data_url: str) -> Image.Image:
    img = Image.open(BytesIO(_split_data_url(data_url)))
    return ImageOps.exif_transpose(img).convert("RGB")


def _load_garment_image(payload: dict[str, Any]) -> Image.Image:
    inline = payload.get("garment_image_data_url")
    if isinstance(inline, str) and inline.strip():
        return _load_image_from_data_url(inline)
    src = (payload.get("garment_source_url") or "").strip()
    if not src:
        raise ValueError("Garment image required (garment_image_data_url or garment_source_url).")
    response = requests.get(src, timeout=30)
    response.raise_for_status()
    img = Image.open(BytesIO(response.content))
    return ImageOps.exif_transpose(img).convert("RGB")


def _encode_jpeg_data_url(image: Image.Image, quality: int = 85) -> str:
    buf = BytesIO()
    image.save(buf, format="JPEG", quality=int(max(1, min(100, quality))))
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# CatVTON expects a fixed aspect ratio (the official demo uses 768×1024).
# Resize-with-padding so we don't distort the customer's photo.
_TARGET_W = 768
_TARGET_H = 1024


def _fit_to_target(img: Image.Image, fill: tuple[int, int, int] = (255, 255, 255)) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Letterbox-resize to (_TARGET_W, _TARGET_H). Returns the resized
    image AND the inner content box (x, y, w, h) so a mask can be built
    only over the actual photo area, not the padding."""
    src_w, src_h = img.size
    scale = min(_TARGET_W / src_w, _TARGET_H / src_h)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (_TARGET_W, _TARGET_H), fill)
    ox = (_TARGET_W - new_w) // 2
    oy = (_TARGET_H - new_h) // 2
    canvas.paste(resized, (ox, oy))
    return canvas, (ox, oy, new_w, new_h)


# ── Inpaint mask (where the diffusion model should place the garment) ──
# CatVTON inpaints inside `mask`. We need a rough torso/upper-body region.
# MediaPipe pose gives us shoulders + hips when visible; otherwise we fall
# back to a centered rectangle covering ~60% of the image.

def _build_torso_mask(person_img: Image.Image, content_box: tuple[int, int, int, int]) -> Image.Image:
    w, h = person_img.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy, cw, ch = content_box

    # MediaPipe pose: relative coordinates in the *content* sub-rectangle,
    # which we then map back to canvas coordinates for the mask.
    try:
        import mediapipe as mp  # type: ignore
        rgb = np.array(person_img.crop((cx, cy, cx + cw, cy + ch)))
        with mp.solutions.pose.Pose(
            static_image_mode=True,
            model_complexity=0,
            min_detection_confidence=0.3,
        ) as pose:
            res = pose.process(rgb)

        if res.pose_landmarks:
            lm = res.pose_landmarks.landmark
            L = mp.solutions.pose.PoseLandmark
            keys = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP]
            pts = [(lm[k.value], getattr(lm[k.value], "visibility", 0.0)) for k in keys]
            if min(p[1] for p in pts) >= 0.3:
                xs = [p[0].x for p in pts]
                ys = [p[0].y for p in pts]
                left   = max(0, int((min(xs) - 0.18) * cw)) + cx
                right  = min(w, int((max(xs) + 0.18) * cw)) + cx
                top    = max(0, int((min(ys) - 0.12) * ch)) + cy
                bottom = min(h, int((max(ys) + 0.55) * ch)) + cy
                draw.rectangle([left, top, right, bottom], fill=255)
                _log(f"mask: pose-driven box=({left},{top},{right},{bottom})")
                return mask
            _log(f"mask: pose visibility too low ({min(p[1] for p in pts):.2f}), using fallback")
        else:
            _log("mask: no pose landmarks, using fallback")
    except Exception as exc:
        _log(f"mask: pose detection error ({exc}), using fallback")

    # Fallback — centered rectangle inside the content area
    left   = cx + int(cw * 0.18)
    right  = cx + int(cw * 0.82)
    top    = cy + int(ch * 0.12)
    bottom = cy + int(ch * 0.88)
    draw.rectangle([left, top, right, bottom], fill=255)
    return mask


# ── Handler ────────────────────────────────────────────────────────────
def handler(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("input") or {}
    if payload.get("task") != "virtual-tryon":
        return {"error": "Unsupported task. Expected 'virtual-tryon'."}

    full_body_data_url = payload.get("full_body_image_data_url")
    if not isinstance(full_body_data_url, str) or not full_body_data_url.strip():
        return {"error": "Missing required field: full_body_image_data_url."}

    try:
        person_raw = _load_image_from_data_url(full_body_data_url)
        garment_raw = _load_garment_image(payload)
    except Exception as exc:
        return {"error": f"Could not load input images: {exc}"}

    try:
        person_img, content_box = _fit_to_target(person_raw)
        garment_img, _ = _fit_to_target(garment_raw)
        mask = _build_torso_mask(person_img, content_box)
    except Exception as exc:
        return {"error": f"Preprocessing failed: {exc}"}

    try:
        pipeline = _load_pipeline_once()
    except Exception as exc:
        return {"error": f"Model not ready: {exc}"}

    try:
        seed = payload.get("seed")
        generator = (
            torch.Generator(device="cuda").manual_seed(int(seed))
            if seed is not None
            else None
        )
        steps = int(payload.get("num_inference_steps", 25))
        guidance = float(payload.get("guidance_scale", 2.5))

        started = time.monotonic()
        result_image = pipeline(
            image=person_img,
            condition_image=garment_img,
            mask=mask,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator,
        )[0]
        elapsed = time.monotonic() - started
        _log(f"inference {elapsed:.2f}s steps={steps} guidance={guidance}")

        return {
            "image_data_url": _encode_jpeg_data_url(result_image, quality=85),
            "details": {
                "renderer": "catvton",
                "inference_seconds": round(elapsed, 3),
                "steps": steps,
                "guidance_scale": guidance,
            },
        }
    except Exception as exc:
        _log(f"inference FAILED: {exc}\n{traceback.format_exc()}")
        return {"error": f"Inference failed: {exc}"}


if __name__ == "__main__":
    # Eagerly load the model at startup. RunPod won't route requests
    # until this returns, so the first real call hits a warm pipeline.
    # If load fails we still start the server so handler() can surface
    # a clear error per request rather than crash-looping the worker.
    try:
        _load_pipeline_once()
    except Exception as exc:
        _log(f"startup load failed (will surface per-request): {exc}")
    runpod.serverless.start({"handler": handler})
