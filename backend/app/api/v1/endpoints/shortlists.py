from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_dress import crud_dress
from app.crud.crud_shortlist import crud_shortlist
from app.models.user import User
from app.schemas.shortlist_item import ShortlistItem, ShortlistItemCreate

router = APIRouter()


@router.get("/me", response_model=List[ShortlistItem])
def read_my_shortlist(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    return crud_shortlist.get_multi_by_user(db, user_id=current_user.id)


@router.post("/me", response_model=ShortlistItem)
def add_shortlist_item(
    *,
    db: Session = Depends(deps.get_db),
    shortlist_in: ShortlistItemCreate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can manage shortlist items.")

    dress = crud_dress.get(db, id=shortlist_in.dress_id)
    if not dress:
        raise HTTPException(status_code=404, detail="Dress not found")

    existing = crud_shortlist.get_by_user_and_dress(
        db, user_id=current_user.id, dress_id=shortlist_in.dress_id
    )
    if existing:
        return existing

    if crud_shortlist.count_by_user(db, user_id=current_user.id) >= 4:
        raise HTTPException(
            status_code=400,
            detail="A maximum of 4 dresses can be shortlisted.",
        )

    return crud_shortlist.create(db, user_id=current_user.id, obj_in=shortlist_in)


@router.delete("/me/{dress_id}")
def remove_shortlist_item(
    dress_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    removed = crud_shortlist.remove(db, user_id=current_user.id, dress_id=dress_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Shortlist item not found")
    return {"success": True}
