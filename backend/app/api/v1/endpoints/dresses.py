from typing import Any, List, Optional
import mimetypes
from uuid import uuid4
from urllib.parse import quote

import httpx

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from app.api import deps
from app.api.v1.endpoints.ai import invalidate_garment_cache
from app.core.config import settings
from app.crud.crud_dress import crud_dress
from app.schemas.dress import Dress, DressCreate, DressUpdate
from app.models.user import User

router = APIRouter()

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
) -> Any:
    """
    Update a dress.
    """
    dress = crud_dress.get(db, id=id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")
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
