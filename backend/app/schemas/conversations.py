from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

from app.constants import DISAPPEARING_OPTIONS

from app.schemas.messages import MessageOut
from app.schemas.users import UserOut


class MemberOut(BaseModel):
    user: UserOut
    role: Literal["admin", "member"]
    request_state: Literal["accepted", "pending"]
    joined_at: datetime
    left_at: datetime | None
    last_delivered_message_id: int | None
    last_read_message_id: int | None


class MyStateOut(BaseModel):
    role: Literal["admin", "member"]
    request_state: Literal["accepted", "pending"]
    muted_until: datetime | None
    is_archived: bool
    is_pinned: bool
    last_read_message_id: int
    left_at: datetime | None


class PinOut(BaseModel):
    message_id: int
    pinned_by: int | None
    pinned_at: datetime
    expires_at: datetime | None
    message: MessageOut


class ConversationOut(BaseModel):
    id: int
    kind: Literal["direct", "group"]
    title: str
    description: str | None
    avatar_url: str | None
    avatar_color: str
    is_note_to_self: bool
    disappearing_seconds: int
    pin_permission: Literal["all", "admins"]
    members: list[MemberOut]
    me: MyStateOut
    unread_count: int
    last_message: MessageOut | None
    last_activity_at: datetime
    safety_number_changed: bool = False
    pins: list[PinOut] = []


def _strip_nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value.strip()


Title = Annotated[str, StringConstraints(max_length=80), AfterValidator(_strip_nonblank)]


class DirectIn(BaseModel):
    user_id: int


class GroupIn(BaseModel):
    title: Title
    member_ids: Annotated[list[int], AfterValidator(lambda ids: list(dict.fromkeys(ids)))] = []
    description: Annotated[str, StringConstraints(max_length=480)] | None = None


class ConversationPatch(BaseModel):
    title: Title | None = None
    description: Annotated[str, StringConstraints(max_length=480)] | None = None
    disappearing_seconds: int | None = None
    pin_permission: Literal["all", "admins"] | None = None

    @field_validator("disappearing_seconds")
    @classmethod
    def _allowed_timer(cls, value: int | None) -> int | None:
        if value is not None and value not in DISAPPEARING_OPTIONS:
            raise ValueError(f"must be one of {DISAPPEARING_OPTIONS}")
        return value


class MyStatePatch(BaseModel):
    muted_until: datetime | None = None
    is_archived: bool | None = None
    is_pinned: bool | None = None


class AddMembersIn(BaseModel):
    user_ids: Annotated[list[int], Field(min_length=1)]


class RoleIn(BaseModel):
    role: Literal["admin", "member"]


class RequestActionIn(BaseModel):
    action: Literal["accept", "block", "delete"]
