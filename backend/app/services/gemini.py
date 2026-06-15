"""Gemini QA service — the AI Try-On quality judge (Step 4).

Scores an editorial try-on image against the standardized garment reference with
a structured JSON rubric: the dress must be faithful (strict), the body must not
be reshaped (loose). Returns the parsed rubric + an overall pass/fail.

Synchronous REST call (generateContent) — returns the verdict immediately, no
webhook. Guarded on GEMINI_API_KEY; without it the caller skips QA.
"""

from __future__ import annotations

import base64
from typing import Any, Dict

import httpx

from app.core.config import settings

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Structured rubric the model must return.
_QA_SCHEMA = {
    "type": "object",
    "properties": {
        "dress": {
            "type": "object",
            "properties": {
                "color_match": {"type": "boolean"},
                "lace_intact": {"type": "boolean"},
                "length_correct": {"type": "boolean"},
                "no_distortion": {"type": "boolean"},
                "score": {"type": "integer"},
            },
            "required": ["color_match", "lace_intact", "length_correct", "no_distortion", "score"],
        },
        "body": {
            "type": "object",
            "properties": {
                "proportions_consistent": {"type": "boolean"},
                "not_reshaped": {"type": "boolean"},
                "score": {"type": "integer"},
            },
            "required": ["proportions_consistent", "not_reshaped", "score"],
        },
        "overall_pass": {"type": "boolean"},
        "notes": {"type": "string"},
    },
    "required": ["dress", "body", "overall_pass", "notes"],
}

_QA_INSTRUCTION = (
    "You are a strict fashion-catalog QA reviewer. The FIRST image is the "
    "standardized reference garment. The SECOND image is an AI-generated try-on "
    "of a customer wearing that garment. Judge ONLY:\n"
    "- DRESS (strict): is the color, lace/embroidery, length, and shape faithful "
    "to the reference, with no distortion? Score 0-100.\n"
    "- BODY (loose): are the customer's proportions consistent and NOT slimmed or "
    "reshaped? Score 0-100.\n"
    "Do NOT judge the face or the background. Return the JSON rubric."
)


class ProviderNotConfigured(Exception):
    """Raised when GEMINI_API_KEY is not set."""


def _fetch_image_part(client: httpx.Client, url: str) -> Dict[str, Any]:
    # SSRF guard: only fetch public https URLs, and never follow redirects to a
    # private host. These URLs come from our own storage in normal flow, but a
    # hijacked webhook could otherwise smuggle an internal address through here.
    from app.utils.url_guard import is_safe_public_url

    if not is_safe_public_url(url):
        raise RuntimeError("Refusing to fetch unsafe (non-public) image URL.")
    resp = client.get(url, follow_redirects=False)
    resp.raise_for_status()
    mime = resp.headers.get("content-type", "image/jpeg").split(";")[0]
    b64 = base64.b64encode(resp.content).decode("ascii")
    return {"inline_data": {"mime_type": mime, "data": b64}}


def run_qa(*, image_url: str, reference_url: str, timeout_seconds: float = 60.0) -> Dict[str, Any]:
    """Run the QA rubric. Returns the parsed dict (with `overall_pass`)."""
    if not settings.GEMINI_API_KEY:
        raise ProviderNotConfigured("Gemini is not configured (GEMINI_API_KEY unset).")

    with httpx.Client(timeout=timeout_seconds) as client:
        ref_part = _fetch_image_part(client, reference_url)
        out_part = _fetch_image_part(client, image_url)

        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": _QA_INSTRUCTION}, ref_part, out_part],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": _QA_SCHEMA,
            },
        }
        # Send the key as a header, not a query param — a key in the URL leaks
        # into httpx exception messages / stack traces / any URL logging.
        resp = client.post(
            f"{_GEMINI_BASE}/{settings.GEMINI_QA_MODEL}:generateContent",
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    # Extract the JSON text from the first candidate part.
    import json

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Gemini QA returned an unparseable response: {exc}")


def passes(rubric: Dict[str, Any]) -> bool:
    """Apply the gate: dress score >= threshold AND body not reshaped."""
    try:
        dress_score = int(rubric.get("dress", {}).get("score", 0))
        not_reshaped = bool(rubric.get("body", {}).get("not_reshaped", False))
    except (TypeError, ValueError):
        return False
    return dress_score >= settings.QA_DRESS_THRESHOLD and not_reshaped
