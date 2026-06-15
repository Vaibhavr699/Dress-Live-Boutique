from typing import Any, List, Optional
import mimetypes
from uuid import uuid4
from urllib.parse import quote

import httpx

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.api.v1.endpoints.ai import invalidate_garment_cache
from app.core.config import settings
from app.crud.crud_dress import crud_dress
from app.crud.crud_dress_image import crud_dress_image
from app.crud.crud_ai_job import crud_ai_job
from app.schemas.dress import Dress, DressCreate, DressUpdate
from app.schemas.dress_image import (
    DRESS_IMAGE_ROLES,
    DressImage as DressImageSchema,
    DressImageCreate,
)
from app.schemas.ai_job import AIJobCreate, AIJobRead
from app.services import job_runner
from app.services.fal import STANDARDIZE_PROMPT
from app.models.dress import Dress as DressModel
from app.models.user import User

# Required angles before standardization can run.
_REQUIRED_ANGLES = ("front", "back", "left", "right")

router = APIRouter()


def _require_owned_dress(
    *, db: Session, dress_id: int, current_user: User
) -> DressModel:
    """Load a dress and enforce that `current_user` is a partner who owns it
    (same boutique). Mirrors the role/ownership checks on the update/delete
    routes so the AI-image routes stay consistent."""
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can manage dress images.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=400, detail="Partner account is not linked to a boutique.")
    dress = crud_dress.get(db, id=dress_id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
    if dress.boutique_id != current_user.boutique_id:
        raise HTTPException(status_code=403, detail="Not allowed to manage this dress.")
    return dress

def _ensure_supabase_storage_config() -> None:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to backend/.env.",
        )


def _build_storage_headers(content_type: Optional[str] = None) -> dict[str, str]:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY or "",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


async def _upload_image_to_storage(*, file: UploadFile, boutique_id: int, folder: str) -> str:
    _ensure_supabase_storage_config()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extension = mimetypes.guess_extension(file.content_type) or ".jpg"
    object_path = f"{folder}/{boutique_id}/{uuid4().hex}{extension}"
    encoded_path = quote(object_path, safe="/")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers={**_build_storage_headers(file.content_type), "x-upsert": "true"},
            content=file_bytes,
        )

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=response.text or "Could not upload image to Supabase Storage.")

    return (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )

@router.get("/", response_model=List[Dress])
def read_dresses(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    boutique_id: Optional[int] = Query(None, description="Filter by boutique ID"),
    visible_only: bool = Query(False, description="Only return dresses from boutiques visible to customers"),
) -> Any:
    """
    Retrieve dresses.
    """
    if visible_only and not boutique_id:
        dresses = crud_dress.get_multi_visible_to_customers(db, skip=skip, limit=limit)
    elif boutique_id:
        dresses = crud_dress.get_multi_by_boutique(
            db, boutique_id=boutique_id, skip=skip, limit=limit
        )
    else:
        dresses = crud_dress.get_multi(db, skip=skip, limit=limit)
    return dresses

@router.post("/", response_model=Dress)
def create_dress(
    *,
    db: Session = Depends(deps.get_db),
    dress_in: DressCreate,
    # Gates this route on an active partner subscription. The dep also
    # enforces partner role + boutique linkage. 402 if no active sub.
    current_user: User = Depends(deps.require_active_subscription),
) -> Any:
    """
    Create new dress.
    """
    dress = crud_dress.create(db, obj_in=dress_in)
    return dress


@router.post("/upload-image", response_model=dict)
async def upload_dress_image(
    *,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Upload a dress image to Supabase Storage and return its public URL.
    Partner-only.
    """
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can upload dress images.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=400, detail="Partner account is not linked to a boutique.")

    public_url = await _upload_image_to_storage(
        file=file,
        boutique_id=current_user.boutique_id,
        folder="dresses",
    )
    return {"url": public_url}


@router.post("/upload-ai-image", response_model=dict)
async def upload_ai_dress_image(
    *,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Upload an AI-ready garment image.
    Partner-only.
    """
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can upload AI garment images.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=400, detail="Partner account is not linked to a boutique.")

    public_url = await _upload_image_to_storage(
        file=file,
        boutique_id=current_user.boutique_id,
        folder="dress-ai-assets",
    )
    return {"url": public_url}

@router.post("/{id}/images", response_model=DressImageSchema)
async def add_dress_image(
    *,
    id: int,
    role: str = Form(...),
    position: int = Form(0),
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Attach a standardization-flow image (front/back/left/right/detail/swatch)
    to a dress. Uploads the file to Supabase Storage, then records the row.
    Partner-only, boutique-scoped. The `standardized` role is reserved for the
    backend (Step 1 output) and cannot be uploaded here.
    """
    dress = _require_owned_dress(db=db, dress_id=id, current_user=current_user)

    if role not in DRESS_IMAGE_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid image role: {role}.")
    if role == "standardized":
        raise HTTPException(
            status_code=400,
            detail="The standardized image is generated by the backend, not uploaded.",
        )

    public_url = await _upload_image_to_storage(
        file=file,
        boutique_id=dress.boutique_id,
        folder="dress-standardization",
    )
    image = crud_dress_image.create(
        db,
        dress_id=id,
        obj_in=DressImageCreate(role=role, url=public_url, position=position),
    )
    return image


@router.get("/{id}/images", response_model=List[DressImageSchema])
def list_dress_images(
    *,
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    """List all standardization-flow images attached to a dress."""
    dress = crud_dress.get(db, id=id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
    return crud_dress_image.get_multi_by_dress(db, dress_id=id)


@router.delete("/{id}/images/{image_id}", response_model=DressImageSchema)
def delete_dress_image(
    *,
    id: int,
    image_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Remove an image from a dress. Partner-only, boutique-scoped."""
    _require_owned_dress(db=db, dress_id=id, current_user=current_user)
    image = crud_dress_image.get(db, id=image_id)
    if not image or image.dress_id != id:
        raise HTTPException(status_code=404, detail="Dress image not found")
    return crud_dress_image.remove(db, id=image_id)


@router.post("/{id}/standardize", response_model=AIJobRead)
def standardize_dress(
    *,
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Kick off Step-1 standardization for a dress (FLUX Kontext via fal, async).

    Requires the 4 required angle images to be present. Creates an AIJob, sets
    the dress to `pending`, and submits to fal. If fal/the public URL isn't
    configured yet, the job stays `pending` (no crash) — the boutique sees a
    pending state and can retry once keys land.

    Partner-only, boutique-scoped. Calling this again is the "Regenerate" action.
    """
    dress = _require_owned_dress(db=db, dress_id=id, current_user=current_user)

    images = crud_dress_image.get_multi_by_dress(db, dress_id=id)
    by_role = {img.role: img for img in images}
    missing = [r for r in _REQUIRED_ANGLES if r not in by_role]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Upload all required angles before standardizing. Missing: {', '.join(missing)}.",
        )

    front_url = by_role["front"].url
    swatch = by_role.get("swatch")

    job = crud_ai_job.create(
        db,
        obj_in=AIJobCreate(
            kind="standardize",
            provider="fal",
            dress_id=id,
            input={
                "image_url": front_url,
                "prompt": STANDARDIZE_PROMPT,
                "swatch_url": swatch.url if swatch else None,
            },
        ),
    )

    dress.standardization_status = "pending"
    db.add(dress)
    db.commit()

    job = job_runner.submit_job(db, job=job)
    return job


class _ManualStandardizeBody(BaseModel):
    url: str


@router.post("/{id}/standardize/accept", response_model=Dress)
def accept_standardized_image(
    *,
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Accept the generated standardized image. Copies the job's result image into
    `dress.standardized_image_url` + a `standardized`-role DressImage row, and
    sets status `approved`. Requires a completed standardize job in `ready`.
    """
    dress = _require_owned_dress(db=db, dress_id=id, current_user=current_user)
    if dress.standardization_status != "ready":
        raise HTTPException(
            status_code=400,
            detail="No standardized image is ready to accept for this dress.",
        )

    # Find the most recent completed standardize job for this dress.
    from app.models.ai_job import AIJob

    job = (
        db.query(AIJob)
        .filter(
            AIJob.dress_id == id,
            AIJob.kind == "standardize",
            AIJob.status == "completed",
        )
        .order_by(AIJob.id.desc())
        .first()
    )
    result_url = None
    if job and isinstance(job.result, dict):
        images = job.result.get("images")
        if isinstance(images, list) and images and isinstance(images[0], dict):
            result_url = images[0].get("url")
        elif isinstance(job.result.get("output"), str):
            result_url = job.result["output"]
    if not result_url:
        raise HTTPException(status_code=400, detail="Standardized image URL not found.")

    crud_dress_image.create(
        db,
        dress_id=id,
        obj_in=DressImageCreate(role="standardized", url=result_url, position=0),
    )
    dress.standardized_image_url = result_url
    dress.standardization_status = "approved"
    db.add(dress)
    db.commit()
    db.refresh(dress)
    invalidate_garment_cache(dress.ai_model_url, dress.image_url, result_url)
    return dress


@router.post("/{id}/standardize/manual", response_model=Dress)
def set_manual_standardized_image(
    *,
    id: int,
    body: _ManualStandardizeBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Skip AI standardization: the boutique uploads its own professional product
    image. Stores it as the standardized image and sets status `manual`.
    """
    dress = _require_owned_dress(db=db, dress_id=id, current_user=current_user)
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="A standardized image URL is required.")

    crud_dress_image.create(
        db,
        dress_id=id,
        obj_in=DressImageCreate(role="standardized", url=url, position=0),
    )
    dress.standardized_image_url = url
    dress.standardization_status = "manual"
    db.add(dress)
    db.commit()
    db.refresh(dress)
    invalidate_garment_cache(dress.ai_model_url, dress.image_url, url)
    return dress


@router.get("/{id}", response_model=Dress)
def read_dress(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get dress by ID.
    """
    dress = crud_dress.get(db, id=id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
    return dress

@router.put("/{id}", response_model=Dress)
def update_dress(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    dress_in: DressUpdate,
    current_user: User = Depends(deps.require_active_subscription),
) -> Any:
    """
    Update a dress.
    """
    dress = crud_dress.get(db, id=id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
    # Boutique-scoped: a partner may only edit dresses in their own boutique
    # (mirrors the delete endpoint). require_active_subscription already
    # guarantees role == partner with an active subscription.
    if not current_user.boutique_id or dress.boutique_id != current_user.boutique_id:
        raise HTTPException(status_code=403, detail="Not allowed to update this dress.")
    # Don't let an update reassign the dress to another boutique.
    if dress_in.boutique_id is not None and dress_in.boutique_id != dress.boutique_id:
        raise HTTPException(status_code=403, detail="Cannot move a dress to another boutique.")
    prev_image_url = dress.image_url
    prev_ai_url = dress.ai_model_url
    dress = crud_dress.update(db, db_obj=dress, obj_in=dress_in)
    # Drop garment-cache entries so an in-progress live call sees the new
    # image immediately instead of waiting for the 60s TTL.
    invalidate_garment_cache(prev_image_url, prev_ai_url, dress.image_url, dress.ai_model_url)
    return dress


@router.delete("/{id}", response_model=Dress)
def delete_dress(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete a dress listing (partner-only, boutique-scoped).
    """
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can delete dresses.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=400, detail="Partner account is not linked to a boutique.")

    dress = crud_dress.get(db, id=id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
    if dress.boutique_id != current_user.boutique_id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this dress.")

    return crud_dress.remove(db, id=id)
