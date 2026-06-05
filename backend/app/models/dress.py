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
    
    boutique_id = Column(Integer, ForeignKey("boutique.id"), nullable=False)
    
    boutique = relationship("Boutique", backref="dresses")
