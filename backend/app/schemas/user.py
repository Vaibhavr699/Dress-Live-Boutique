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
    profile_image_url: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    apartment_number: Optional[str] = None
    state_province: Optional[str] = None
    region: Optional[str] = None
    postal_code: Optional[str] = None
    country_code: Optional[str] = None
    role: Literal["buyer", "partner"] = "buyer"
    boutique_id: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bust_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    arm_length_cm: Optional[float] = None
    measurements_source: Optional[str] = None


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
