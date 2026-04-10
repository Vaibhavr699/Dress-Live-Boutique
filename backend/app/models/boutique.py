from sqlalchemy import Boolean, Column, Integer, String, Text
from app.db.base_class import Base

class Boutique(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String, index=True, nullable=True)
    logo_url = Column(String, nullable=True)
    header_image_url = Column(String, nullable=True)
    is_visible_to_customers = Column(Boolean, nullable=False, default=True)
