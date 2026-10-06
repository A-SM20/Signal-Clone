from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class IdentityVerification(Base):
    """`verifier` checked `subject`'s safety number while their key was `verified_key`."""

    __tablename__ = "identity_verifications"

    verifier_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    verified_key: Mapped[str] = mapped_column(String(64))
    verified_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
