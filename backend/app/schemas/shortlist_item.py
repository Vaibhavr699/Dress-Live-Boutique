from datetime import datetime
from pydantic import BaseModel


class ShortlistItemBase(BaseModel):
    dress_id: int


class ShortlistItemCreate(ShortlistItemBase):
    pass


class ShortlistItem(ShortlistItemBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
