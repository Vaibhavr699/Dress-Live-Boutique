from typing import Any, List, Optional
import mimetypes
from urllib.parse import quote, unquote
from uuid import uuid4

import httpx

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.api import deps
from app.core.config import settings
from app.crud.crud_boutique import crud_boutique
from app.models.user import User
from app.schemas.boutique import Boutique, BoutiqueCreate, BoutiqueUpdate

router = APIRouter()


def _ensure_supabase_storage_config() -> None:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to backend/.env.",
        )


def _build_storage_headers(content_type: Optional[str] = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY or "",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _extract_storage_object_path(image_url: Optional[str]) -> Optional[str]:
    if not image_url or not settings.SUPABASE_URL:
        return None
    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if not image_url.startswith(public_prefix):
        return None
    return unquote(image_url.replace(public_prefix, "", 1))


async def _delete_storage_object(image_url: Optional[str]) -> None:
    object_path = _extract_storage_object_path(image_url)
    if not object_path:
        return
    encoded_path = quote(object_path, safe="/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers=_build_storage_headers(),
        )
        if response.status_code not in (200, 204, 404):
            print(f"WARNING: Failed to delete Supabase object {object_path}: {response.text}")

@router.get("/", response_model=List[Boutique])
def read_boutiques(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve boutiques.
    """
    boutiques = crud_boutique.get_multi(db, skip=skip, limit=limit)
    return boutiques

@router.post("/", response_model=Boutique)
def create_boutique(
    *,
    db: Session = Depends(deps.get_db),
    boutique_in: BoutiqueCreate,
) -> Any:
    """
    Create new boutique.
    """
    boutique = crud_boutique.create(db, obj_in=boutique_in)
    return boutique

@router.get("/{id}", response_model=Boutique)
def read_boutique(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get boutique by ID.
    """
    boutique = crud_boutique.get(db, id=id)
    if not boutique:
        raise HTTPException(status_code=404, detail="Boutique not found")
    return boutique

@router.put("/{id}", response_model=Boutique)
def update_boutique(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    boutique_in: BoutiqueUpdate,
) -> Any:
    """
    Update a boutique.
    """
    boutique = crud_boutique.get(db, id=id)
    if not boutique:
        raise HTTPException(status_code=404, detail="Boutique not found")
    boutique = crud_boutique.update(db, db_obj=boutique, obj_in=boutique_in)
    return boutique


@router.post("/{id}/header-image", response_model=Boutique)
async def upload_boutique_header_image(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can upload boutique cover images.")
    if not current_user.boutique_id or current_user.boutique_id != id:
        raise HTTPException(status_code=403, detail="Not allowed to update this boutique.")

    boutique = crud_boutique.get(db, id=id)
    if not boutique:
        raise HTTPException(status_code=404, detail="Boutique not found")

    _ensure_supabase_storage_config()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extension = mimetypes.guess_extension(file.content_type) or ".jpg"
    object_path = f"boutiques/{id}/headers/{uuid4().hex}{extension}"
    encoded_path = quote(object_path, safe="/")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers={**_build_storage_headers(file.content_type), "x-upsert": "true"},
            content=file_bytes,
        )

    if response.status_code not in (200, 201):
        detail = response.text.strip() or "Unknown storage error."
        raise HTTPException(
            status_code=502,
            detail=f"Could not upload boutique cover image. Storage response: {detail[:300]}",
        )

    previous_image_url = boutique.header_image_url
    public_url = (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )
    boutique = crud_boutique.update(
        db,
        db_obj=boutique,
        obj_in=BoutiqueUpdate(header_image_url=public_url),
    )

    if previous_image_url and previous_image_url != public_url:
        await _delete_storage_object(previous_image_url)

    return boutique


@router.post("/{id}/logo-image", response_model=Boutique)
async def upload_boutique_logo_image(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can upload boutique logo images.")
    if not current_user.boutique_id or current_user.boutique_id != id:
        raise HTTPException(status_code=403, detail="Not allowed to update this boutique.")

    boutique = crud_boutique.get(db, id=id)
    if not boutique:
        raise HTTPException(status_code=404, detail="Boutique not found")

    _ensure_supabase_storage_config()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extension = mimetypes.guess_extension(file.content_type) or ".jpg"
    object_path = f"boutiques/{id}/logos/{uuid4().hex}{extension}"
    encoded_path = quote(object_path, safe="/")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers={**_build_storage_headers(file.content_type), "x-upsert": "true"},
            content=file_bytes,
        )

    if response.status_code not in (200, 201):
        detail = response.text.strip() or "Unknown storage error."
        raise HTTPException(
            status_code=502,
            detail=f"Could not upload boutique logo image. Storage response: {detail[:300]}",
        )

    previous_image_url = boutique.logo_url
    public_url = (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )
    boutique = crud_boutique.update(
        db,
        db_obj=boutique,
        obj_in=BoutiqueUpdate(logo_url=public_url),
    )

    if previous_image_url and previous_image_url != public_url:
        await _delete_storage_object(previous_image_url)

    return boutique


@router.post("/{id}/interior-image", response_model=Boutique)
async def upload_boutique_interior_image(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can upload boutique interior images.")
    if not current_user.boutique_id or current_user.boutique_id != id:
        raise HTTPException(status_code=403, detail="Not allowed to update this boutique.")

    boutique = crud_boutique.get(db, id=id)
    if not boutique:
        raise HTTPException(status_code=404, detail="Boutique not found")

    _ensure_supabase_storage_config()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extension = mimetypes.guess_extension(file.content_type) or ".jpg"
    object_path = f"boutiques/{id}/interiors/{uuid4().hex}{extension}"
    encoded_path = quote(object_path, safe="/")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers={**_build_storage_headers(file.content_type), "x-upsert": "true"},
            content=file_bytes,
        )

    if response.status_code not in (200, 201):
        detail = response.text.strip() or "Unknown storage error."
        raise HTTPException(
            status_code=502,
            detail=f"Could not upload boutique interior image. Storage response: {detail[:300]}",
        )

    previous_image_url = boutique.interior_image_url
    public_url = (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )
    boutique = crud_boutique.update(
        db,
        db_obj=boutique,
        obj_in=BoutiqueUpdate(interior_image_url=public_url),
    )

    if previous_image_url and previous_image_url != public_url:
        await _delete_storage_object(previous_image_url)

    return boutique
