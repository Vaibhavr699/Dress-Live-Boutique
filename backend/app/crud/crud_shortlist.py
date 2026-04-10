from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.shortlist_item import ShortlistItem
from app.schemas.shortlist_item import ShortlistItemCreate


class CRUDShortlist:
    def get_by_user_and_dress(
        self, db: Session, *, user_id: int, dress_id: int
    ) -> Optional[ShortlistItem]:
        return (
            db.query(ShortlistItem)
            .filter(ShortlistItem.user_id == user_id, ShortlistItem.dress_id == dress_id)
            .first()
        )

    def get_multi_by_user(self, db: Session, *, user_id: int) -> List[ShortlistItem]:
        return (
            db.query(ShortlistItem)
            .filter(ShortlistItem.user_id == user_id)
            .order_by(ShortlistItem.created_at.desc())
            .all()
        )

    def count_by_user(self, db: Session, *, user_id: int) -> int:
        return db.query(ShortlistItem).filter(ShortlistItem.user_id == user_id).count()

    def create(self, db: Session, *, user_id: int, obj_in: ShortlistItemCreate) -> ShortlistItem:
        db_obj = ShortlistItem(user_id=user_id, dress_id=obj_in.dress_id)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, user_id: int, dress_id: int) -> Optional[ShortlistItem]:
        db_obj = self.get_by_user_and_dress(db, user_id=user_id, dress_id=dress_id)
        if not db_obj:
            return None
        db.delete(db_obj)
        db.commit()
        return db_obj


crud_shortlist = CRUDShortlist()
