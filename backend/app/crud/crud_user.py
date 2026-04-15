from typing import Any, Dict, Optional, Union
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.models.booking import Booking
from app.models.shortlist_item import ShortlistItem
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser:
    def get(self, db: Session, id: Any) -> Optional[User]:
        return db.query(User).filter(User.id == id).first()

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        db_obj = User(
            email=obj_in.email,
            hashed_password=get_password_hash(obj_in.password),
            full_name=obj_in.full_name,
            profile_image_url=obj_in.profile_image_url,
            phone=obj_in.phone,
            address=obj_in.address,
            apartment_number=obj_in.apartment_number,
            state_province=obj_in.state_province,
            region=obj_in.region,
            postal_code=obj_in.postal_code,
            country_code=obj_in.country_code,
            is_active=obj_in.is_active,
            is_superuser=obj_in.is_superuser,
            role=obj_in.role,
            boutique_id=obj_in.boutique_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, db: Session, *, db_obj: User, obj_in: Union[UserUpdate, Dict[str, Any]]
    ) -> User:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        if update_data.get("password"):
            hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            update_data["hashed_password"] = hashed_password
            
        for field in update_data:
            if hasattr(db_obj, field):
                setattr(db_obj, field, update_data[field])

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def authenticate(
        self, db: Session, *, email: str, password: str
    ) -> Optional[User]:
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser

    def remove(self, db: Session, *, id: int) -> Optional[User]:
        user = self.get(db, id=id)
        if not user:
            return None

        db.query(ShortlistItem).filter(ShortlistItem.user_id == id).delete()
        db.query(Booking).filter(Booking.user_id == id).delete()
        db.delete(user)
        db.commit()
        return user


crud_user = CRUDUser()
