from typing import Optional
from pydantic import BaseModel

# Shared properties
class BoutiqueBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    logo_url: Optional[str] = None
    header_image_url: Optional[str] = None
    interior_image_url: Optional[str] = None
    availability_schedule: Optional[str] = None
    is_visible_to_customers: Optional[bool] = True

# Properties to receive via API on creation
class BoutiqueCreate(BoutiqueBase):
    name: str

# Properties to receive via API on update
class BoutiqueUpdate(BoutiqueBase):
    pass

class BoutiqueInDBBase(BoutiqueBase):
    id: int

    class Config:
        from_attributes = True

# Additional properties to return via API
class Boutique(BoutiqueInDBBase):
    pass

# Additional properties stored in DB
class BoutiqueInDB(BoutiqueInDBBase):
    pass
