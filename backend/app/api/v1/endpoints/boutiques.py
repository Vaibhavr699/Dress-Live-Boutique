from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.crud.crud_boutique import crud_boutique
from app.schemas.boutique import Boutique, BoutiqueCreate, BoutiqueUpdate

router = APIRouter()

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
