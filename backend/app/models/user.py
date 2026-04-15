from sqlalchemy import Column, Integer, String, Boolean
from app.db.base_class import Base

class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    profile_image_url = Column(String, nullable=True)
    password_otp_hash = Column(String, nullable=True)
    password_otp_expires_at = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    apartment_number = Column(String, nullable=True)
    state_province = Column(String, nullable=True)
    region = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country_code = Column(String, nullable=True)
    is_active = Column(Boolean(), default=True)
    is_superuser = Column(Boolean(), default=False)
    role = Column(String, nullable=False, default="buyer")
    boutique_id = Column(Integer, nullable=True)
