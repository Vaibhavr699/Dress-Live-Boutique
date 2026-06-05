from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.dress import Dress
from app.models.boutique import Boutique
from app.schemas.dress import DressCreate, DressUpdate

class CRUDDress:
    def get(self, db: Session, id: int) -> Optional[Dress]:
        return db.query(Dress).filter(Dress.id == id).first()

    def get_multi(
        self, db: Session, *, skip: int = 0, limit: int = 100
    ) -> List[Dress]:
        return db.query(Dress).offset(skip).limit(limit).all()
        
    def get_multi_by_boutique(
        self, db: Session, *, boutique_id: int, skip: int = 0, limit: int = 100
    ) -> List[Dress]:
        return (
            db.query(Dress)
            .filter(Dress.boutique_id == boutique_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_multi_visible_to_customers(
        self, db: Session, *, skip: int = 0, limit: int = 100
    ) -> List[Dress]:
        return (
            db.query(Dress)
            .join(Boutique, Dress.boutique_id == Boutique.id)
            .filter(Boutique.is_visible_to_customers.is_(True))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create(self, db: Session, *, obj_in: DressCreate) -> Dress:
        db_obj = Dress(
            name=obj_in.name,
            description=obj_in.description,
            price=obj_in.price,
            sizes=obj_in.sizes,
            colors=obj_in.colors,
            category=obj_in.category,
            image_url=obj_in.image_url,
            ai_model_url=obj_in.ai_model_url,
            is_ai_enabled=obj_in.is_ai_enabled,
            boutique_id=obj_in.boutique_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, db: Session, *, db_obj: Dress, obj_in: DressUpdate
    ) -> Dress:
        update_data = obj_in.model_dump(exclude_unset=True)
        for field in update_data:
            if hasattr(db_obj, field):
                setattr(db_obj, field, update_data[field])
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: int) -> Dress:
        obj = db.query(Dress).get(id)
        db.delete(obj)
        db.commit()
        return obj

crud_dress = CRUDDress()
