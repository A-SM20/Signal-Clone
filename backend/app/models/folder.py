from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class ChatFolder(Base):
    """A tab above the chat list: chats matching the type filters or picked explicitly, optionally unread-only."""

    __tablename__ = "chat_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(Integer, default=0)
    include_direct: Mapped[bool] = mapped_column(Boolean, default=False)
    include_groups: Mapped[bool] = mapped_column(Boolean, default=False)
    unread_only: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class ChatFolderConversation(Base):
    __tablename__ = "chat_folder_conversations"

    folder_id: Mapped[int] = mapped_column(ForeignKey("chat_folders.id", ondelete="CASCADE"), primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
