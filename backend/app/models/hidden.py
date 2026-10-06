from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class HiddenMessage(Base):
    """"Delete for me": the message stays for everyone else but never reaches this user again."""

    __tablename__ = "hidden_messages"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    hidden_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
