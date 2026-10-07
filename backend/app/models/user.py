from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    username: Mapped[str | None] = mapped_column(String(40), unique=True)
    pin: Mapped[str | None] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(80))
    about: Mapped[str | None] = mapped_column(String(140))
    avatar_path: Mapped[str | None] = mapped_column(String(64))
    avatar_color: Mapped[str] = mapped_column(String(16))
    identity_key: Mapped[str] = mapped_column(String(64))  # base64 of a 32-byte (mock) public key
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    settings: Mapped["UserSettings"] = relationship(lazy="raise", uselist=False, passive_deletes=True)


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(8), default="system")  # system | light | dark
    chat_color: Mapped[str] = mapped_column(String(16), default="ultramarine")
    read_receipts: Mapped[bool] = mapped_column(Boolean, default=True)
    typing_indicators: Mapped[bool] = mapped_column(Boolean, default=True)
    share_last_seen: Mapped[bool] = mapped_column(Boolean, default=True)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_preview: Mapped[str] = mapped_column(String(20), default="name_and_message")
    default_disappearing_seconds: Mapped[int] = mapped_column(Integer, default=0)
    chat_wallpaper: Mapped[str] = mapped_column(String(16), default="default")
    chat_font_family: Mapped[str] = mapped_column(String(32), default="system")
    chat_font_size: Mapped[int] = mapped_column(Integer, default=14)
