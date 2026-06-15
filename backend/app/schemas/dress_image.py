from datetime import datetime
from typing import Optional

from pydantic import BaseModel

# Allowed roles for a dress image. `standardized` is set by the backend
# (Step 1 output), never uploaded directly by the client.
DRESS_IMAGE_ROLES = (
    "front",
    "back",
    "left",
    "right",
    "detail",
    "swatch",
    "standardized",
)


class DressImageBase(BaseModel):
    role: str
    url: str
    position: Optional[int] = 0


# Properties to receive when attaching an image to a dress.
class DressImageCreate(DressImageBase):
    pass


class DressImageInDBBase(DressImageBase):
    id: int
    dress_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Additional properties to return via API.
class DressImage(DressImageInDBBase):
    pass
