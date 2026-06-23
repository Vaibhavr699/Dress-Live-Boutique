from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class DressImage(Base):
    """One image attached to a dress for the AI Try-On standardization flow.

    A dress collects several of these: the 4 required angle shots
    (front/back/left/right), optional detail close-ups, a colour swatch,
    and — once Step 1 runs — the generated `standardized` studio image.
    `role` says which is which; `position` orders multiple rows of the same
    role (e.g. several `detail` close-ups).

    The dress's overall standardization state lives on the `dress` row
    (`standardization_status` + `standardized_image_url`), not here — these
    rows are the raw material and history.
    """

    __tablename__ = "dressimage"

    id = Column(Integer, primary_key=True, index=True)
    dress_id = Column(
        Integer, ForeignKey("dress.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # front | back | left | right | detail | swatch | standardized
    role = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    dress = relationship("Dress", back_populates="images")
