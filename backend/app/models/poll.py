from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class Poll(Base):
    __tablename__ = "polls"

    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    question: Mapped[str] = mapped_column(String(200))
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class PollOption(Base):
    __tablename__ = "poll_options"
    __table_args__ = (UniqueConstraint("poll_message_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    poll_message_id: Mapped[int] = mapped_column(ForeignKey("polls.message_id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(100))


class PollVote(Base):
    """Votes are not anonymous (as in Signal): everyone in the chat can see who chose what."""

    __tablename__ = "poll_votes"

    option_id: Mapped[int] = mapped_column(ForeignKey("poll_options.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    voted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
