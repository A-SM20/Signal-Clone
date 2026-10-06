from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow

if TYPE_CHECKING:
    from app.models.user import User


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(8))  # direct | group
    # "minUserId:maxUserId" for direct chats, so the DB guarantees one chat per pair.
    direct_key: Mapped[str | None] = mapped_column(String(32), unique=True)
    title: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(480))
    avatar_path: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    disappearing_seconds: Mapped[int] = mapped_column(Integer, default=0)
    pin_permission: Mapped[str] = mapped_column(String(8), default="all")  # all | admins
    last_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL", use_alter=True)
    )
    last_activity_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    members: Mapped[list["ConversationMember"]] = relationship(lazy="raise", passive_deletes=True)


class ConversationMember(Base):
    """Per-member state for a conversation, including the receipt cursors."""

    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(8), default="member")  # admin | member
    request_state: Mapped[str] = mapped_column(String(10), default="accepted")  # accepted | pending
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_delivered_message_id: Mapped[int] = mapped_column(Integer, default=0)
    last_read_message_id: Mapped[int] = mapped_column(Integer, default=0)
    muted_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(lazy="raise")
