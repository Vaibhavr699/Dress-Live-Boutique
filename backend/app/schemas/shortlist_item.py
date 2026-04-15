from datetime import datetime
from pydantic import BaseModel
from typing import List


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


class ShortlistReplacePayload(BaseModel):
    dress_ids: List[int]
