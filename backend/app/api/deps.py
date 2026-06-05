from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.crud.crud_user import crud_user
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.token import TokenPayload

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"/api/v1/login/access-token"
)

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (jwt.JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = crud_user.get(db, id=token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not crud_user.is_active(current_user):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    if not crud_user.is_superuser(current_user):
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user


def require_advisor(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Self-service routes for an invited advisor (their own profile and
    availability). Distinct from partner management — an advisor may only
    act on their own linked record, never the team."""
    if current_user.role != "advisor":
        raise HTTPException(status_code=403, detail="Advisor access only.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=403, detail="Advisor is not linked to a boutique.")
    return current_user


def require_active_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Block partner-mutation routes when the boutique doesn't have an
    active Stripe subscription. 402 Payment Required is the semantically
    correct status (client should redirect to /subscribe). Buyers are
    waved through — this only gates partner roles. Superusers bypass the
    check so an admin can fix things server-side."""
    if settings.SUBSCRIPTION_BYPASS:
        # Testing escape hatch — see config.SUBSCRIPTION_BYPASS. Off in prod.
        return current_user
    if current_user.is_superuser:
        return current_user
    if current_user.role != "partner":
        # Non-partners shouldn't ever hit this dep, but if they do we
        # don't want to silently allow it. Fall through to 403.
        raise HTTPException(status_code=403, detail="Only partners can call this endpoint.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=403, detail="Partner is not linked to a boutique.")
    from app.models.boutique import Boutique  # local import to avoid cycles
    boutique = db.query(Boutique).filter(Boutique.id == current_user.boutique_id).first()
    if boutique is None:
        raise HTTPException(status_code=404, detail="Boutique not found.")
    if boutique.subscription_status != "active":
        raise HTTPException(
            status_code=402,
            detail="Your Dress Live Partner subscription is not active. "
                   "Reactivate from the wallet to publish dresses.",
        )
    return current_user
