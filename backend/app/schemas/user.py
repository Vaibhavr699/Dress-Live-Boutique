from typing import Literal, Optional
from pydantic import BaseModel, EmailStr


class BoutiqueSignupInfo(BaseModel):
    name: str
    description: Optional[str] = None
    location: Optional[str] = None


# Shared properties
class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False
    full_name: Optional[str] = None
    role: Literal["buyer", "partner"] = "buyer"
    boutique_id: Optional[int] = None


# Properties to receive via API on creation
class UserCreate(UserBase):
    email: EmailStr
    password: str
    boutique_info: Optional[BoutiqueSignupInfo] = None


# Properties to receive via API on update
class UserUpdate(UserBase):
    password: Optional[str] = None


class UserInDBBase(UserBase):
    id: Optional[int] = None

    class Config:
        from_attributes = True


# Additional properties to return via API
class User(UserInDBBase):
    pass


# Additional properties stored in DB
class UserInDB(UserInDBBase):
    hashed_password: str
