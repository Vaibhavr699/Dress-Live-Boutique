from typing import Optional
from pydantic import BaseModel

# Shared properties
class DressBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    sizes: Optional[str] = None
    colors: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    ai_model_url: Optional[str] = None
    is_ai_enabled: Optional[bool] = True
    boutique_id: Optional[int] = None

# Properties to receive via API on creation
class DressCreate(DressBase):
    name: str
    price: float
    boutique_id: int

# Properties to receive via API on update
class DressUpdate(DressBase):
    pass

class DressInDBBase(DressBase):
    id: int

    class Config:
        from_attributes = True

# Additional properties to return via API
class Dress(DressInDBBase):
    pass

# Additional properties stored in DB
class DressInDB(DressInDBBase):
    pass
