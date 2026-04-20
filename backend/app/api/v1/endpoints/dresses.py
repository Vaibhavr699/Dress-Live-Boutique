from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.crud.crud_dress import crud_dress
from app.schemas.dress import Dress, DressCreate, DressUpdate
from app.models.user import User

router = APIRouter()

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
    dress = crud_dress.update(db, db_obj=dress, obj_in=dress_in)
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
