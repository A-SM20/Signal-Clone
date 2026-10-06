from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

from app.constants import DISAPPEARING_OPTIONS, USERNAME_PATTERN


class UserOut(BaseModel):
    id: int
    phone: str
    username: str | None
    display_name: str
    about: str | None
    avatar_url: str | None
    avatar_color: str
    online: bool
    last_seen_at: datetime | None


class SettingsOut(BaseModel):
    theme: Literal["system", "light", "dark"]
    chat_color: str
    read_receipts: bool
    typing_indicators: bool
    share_last_seen: bool
    notifications_enabled: bool
    notification_preview: Literal["name_and_message", "name_only", "none"]
    default_disappearing_seconds: int


class MeOut(UserOut):
    settings: SettingsOut


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value.strip()


DisplayName = Annotated[str, StringConstraints(max_length=80), AfterValidator(_not_blank)]


class MePatch(BaseModel):
    display_name: DisplayName | None = None
    about: Annotated[str, StringConstraints(max_length=140)] | None = None
    username: Annotated[str, StringConstraints(pattern=USERNAME_PATTERN)] | None = None


class SettingsPatch(BaseModel):
    theme: Literal["system", "light", "dark"] | None = None
    chat_color: Annotated[str, StringConstraints(max_length=16)] | None = None
    read_receipts: bool | None = None
    typing_indicators: bool | None = None
    share_last_seen: bool | None = None
    notifications_enabled: bool | None = None
    notification_preview: Literal["name_and_message", "name_only", "none"] | None = None
    default_disappearing_seconds: int | None = Field(default=None)

    @field_validator("default_disappearing_seconds")
    @classmethod
    def _allowed_timer(cls, value: int | None) -> int | None:
        if value is not None and value not in DISAPPEARING_OPTIONS:
            raise ValueError(f"must be one of {DISAPPEARING_OPTIONS}")
        return value
