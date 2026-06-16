"""Small synchronous Supabase Storage helper for server-side pipeline uploads
(e.g. an inverted mask generated mid-pipeline). The endpoint handlers have their
own async UploadFile-based uploader; this is the bytes-in, url-out variant for
services that run synchronously inside the job chain.
"""

from __future__ import annotations

from uuid import uuid4
from urllib.parse import quote

import httpx

from app.core.config import settings


def upload_bytes(*, data: bytes, folder: str, content_type: str = "image/png") -> str:
    """Upload raw bytes to Supabase Storage and return the public URL."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase Storage is not configured.")

    ext = ".png" if "png" in content_type else ".jpg"
    object_path = f"{folder}/{uuid4().hex}{ext}"
    encoded_path = quote(object_path, safe="/")
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers=headers,
            content=data,
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Supabase upload failed {resp.status_code}: {resp.text[:200]}")
    return (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )
