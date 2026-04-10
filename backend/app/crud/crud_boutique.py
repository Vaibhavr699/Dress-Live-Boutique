from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.boutique import Boutique
from app.schemas.boutique import BoutiqueCreate, BoutiqueUpdate

class CRUDBoutique:
    def get(self, db: Session, id: int) -> Optional[Boutique]:
        return db.query(Boutique).filter(Boutique.id == id).first()

    def get_multi(
        self, db: Session, *, skip: int = 0, limit: int = 100
    ) -> List[Boutique]:
        return db.query(Boutique).offset(skip).limit(limit).all()

    def create(self, db: Session, *, obj_in: BoutiqueCreate) -> Boutique:
        db_obj = Boutique(
            name=obj_in.name,
            description=obj_in.description,
            location=obj_in.location,
            logo_url=obj_in.logo_url,
            header_image_url=obj_in.header_image_url,
            is_visible_to_customers=(
                True if obj_in.is_visible_to_customers is None else obj_in.is_visible_to_customers
            ),
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, db: Session, *, db_obj: Boutique, obj_in: BoutiqueUpdate
    ) -> Boutique:
        update_data = obj_in.model_dump(exclude_unset=True)
        for field in update_data:
            if hasattr(db_obj, field):
                setattr(db_obj, field, update_data[field])
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: int) -> Boutique:
        obj = db.query(Boutique).get(id)
        db.delete(obj)
        db.commit()
        return obj

crud_boutique = CRUDBoutique()
