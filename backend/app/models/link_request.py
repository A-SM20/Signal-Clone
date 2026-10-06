from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime, utcnow


class LinkRequest(Base):
    """A new browser asking to be linked; approved by a signed-in device that types or scans `code`."""

    __tablename__ = "link_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)
    poll_secret_hash: Mapped[str] = mapped_column(String(64))
    requested_device_name: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(8), default="pending")  # pending | approved | expired
    approved_by_device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"))
    issued_device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
