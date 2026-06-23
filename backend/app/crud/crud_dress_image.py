from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.dress_image import DressImage
from app.schemas.dress_image import DressImageCreate


class CRUDDressImage:
    def get(self, db: Session, id: int) -> Optional[DressImage]:
        return db.query(DressImage).filter(DressImage.id == id).first()

    def get_multi_by_dress(self, db: Session, *, dress_id: int) -> List[DressImage]:
        return (
            db.query(DressImage)
            .filter(DressImage.dress_id == dress_id)
            .order_by(DressImage.role, DressImage.position, DressImage.id)
            .all()
        )

    def get_by_role(
        self, db: Session, *, dress_id: int, role: str
    ) -> List[DressImage]:
        return (
            db.query(DressImage)
            .filter(DressImage.dress_id == dress_id, DressImage.role == role)
            .order_by(DressImage.position, DressImage.id)
            .all()
        )

    def create(
        self, db: Session, *, dress_id: int, obj_in: DressImageCreate
    ) -> DressImage:
        db_obj = DressImage(
            dress_id=dress_id,
            role=obj_in.role,
            url=obj_in.url,
            position=obj_in.position or 0,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: int) -> Optional[DressImage]:
        obj = db.query(DressImage).get(id)
        if obj is None:
            return None
        db.delete(obj)
        db.commit()
        return obj


crud_dress_image = CRUDDressImage()
