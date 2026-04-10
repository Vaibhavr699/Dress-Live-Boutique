from typing import Any
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_user import crud_user
from app.models.user import User
from app.schemas.boutique import BoutiqueCreate
from app.schemas.user import User as UserSchema, UserCreate

router = APIRouter()

@router.post("", response_model=UserSchema)
async def create_user(
    request: Request,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Create new user.
    """
    try:
        body = await request.json()
        if body.get("boutique_info") and not body.get("role"):
            body["role"] = "partner"

        if body.get("role") == "partner":
            boutique_info = body.get("boutique_info")
            if not boutique_info or not boutique_info.get("name"):
                raise HTTPException(
                    status_code=422,
                    detail="Partner registrations require boutique_info with a name.",
                )

        print(f"DEBUG: Parsed JSON: {body}")
        user_in = UserCreate(**body)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raw_body = await request.body()
        print(f"DEBUG: Validation/Parsing failed.")
        print(f"DEBUG: Content-Type: {request.headers.get('content-type')}")
        print(f"DEBUG: Raw Body: {raw_body}")
        raise HTTPException(status_code=422, detail=str(e))

    user = crud_user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )

    if user_in.role == "partner" and user_in.boutique_info:
        boutique = crud_boutique.create(
            db,
            obj_in=BoutiqueCreate(
                name=user_in.boutique_info.name,
                description=user_in.boutique_info.description,
                location=user_in.boutique_info.location,
            ),
        )
        user_in.boutique_id = boutique.id

    user = crud_user.create(db, obj_in=user_in)
    return user

@router.get("/me", response_model=UserSchema)
def read_user_me(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get current user.
    """
    return current_user
