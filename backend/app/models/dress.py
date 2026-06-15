from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Dress(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    sizes = Column(String, nullable=True)  # Comma-separated list
    colors = Column(String, nullable=True) # Comma-separated list
    category = Column(String, nullable=True) # Comma-separated list (Abendkleider, Hochzeitskleider, Add Ons)
    image_url = Column(String, nullable=True)
    ai_model_url = Column(String, nullable=True) # Path for AI engine
    is_ai_enabled = Column(Boolean(), default=True)

    # AI Try-On standardization state. `standardization_status` drives the
    # boutique Accept / Regenerate / Upload-manually flow:
    #   none -> pending -> ready -> approved | manual
    # `standardized_image_url` is a fast pointer to the approved standardized
    # image (mirrors the `standardized`-role DressImage row); the try-on path
    # reads this one field instead of querying the images table.
    standardization_status = Column(String, nullable=False, server_default="none")
    standardized_image_url = Column(String, nullable=True)

    boutique_id = Column(Integer, ForeignKey("boutique.id"), nullable=False)

    boutique = relationship("Boutique", backref="dresses")
    images = relationship(
        "DressImage", cascade="all, delete-orphan", back_populates="dress"
    )
