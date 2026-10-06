from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.constants import MAX_ALBUM_SIZE, MAX_BODY_LENGTH


class ReplyPreviewOut(BaseModel):
    id: int
    sender_id: int | None
    kind: str
    body: str | None
    deleted: bool


class AttachmentOut(BaseModel):
    id: int
    kind: str
    mime_type: str
    size_bytes: int
    original_name: str
    url: str
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    waveform: list[int] | None = None


class ReactionOut(BaseModel):
    user_id: int
    emoji: str


class PollOptionOut(BaseModel):
    id: int
    text: str
    vote_count: int
    voter_ids: list[int]


class PollOut(BaseModel):
    question: str
    allow_multiple: bool
    ended_at: datetime | None
    options: list[PollOptionOut]


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    client_id: str | None
    kind: str
    body: str | None
    reply_to: ReplyPreviewOut | None = None
    system_event: dict | None = None
    created_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    expires_at: datetime | None = None
    attachments: list[AttachmentOut] = []
    reactions: list[ReactionOut] = []
    poll: PollOut | None = None


class MessagePage(BaseModel):
    items: list[MessageOut]
    has_more: bool


SUPPORTED_KINDS = {"text", "media", "poll"}  # extended as voice lands

PollText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class PollIn(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    options: Annotated[list[PollText], Field(min_length=2, max_length=10)]
    allow_multiple: bool = False

    @model_validator(mode="after")
    def _unique(self):
        if len({o.casefold() for o in self.options}) != len(self.options):
            raise ValueError("poll options must be different")
        return self


class SendMessageIn(BaseModel):
    client_id: UUID
    kind: Literal["text", "media", "voice", "poll"] = "text"
    body: Annotated[str, StringConstraints(max_length=MAX_BODY_LENGTH)] | None = None
    reply_to_id: int | None = None
    attachment_ids: Annotated[list[int], Field(max_length=MAX_ALBUM_SIZE)] = []
    poll: PollIn | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.kind not in SUPPORTED_KINDS:
            raise ValueError(f"kind '{self.kind}' is not supported")
        self.body = self.body.strip() if self.body else None
        if self.kind == "text" and not self.body:
            raise ValueError("message body must not be empty")
        if self.kind == "media" and not self.attachment_ids:
            raise ValueError("media messages need at least one attachment")
        if self.kind == "text" and self.attachment_ids:
            raise ValueError("use kind 'media' to send attachments")
        if (self.kind == "poll") != (self.poll is not None):
            raise ValueError("poll messages need a poll, and only poll messages may have one")
        if self.kind == "poll" and (self.body or self.attachment_ids):
            raise ValueError("poll messages carry only the poll")
        return self


class EditMessageIn(BaseModel):
    body: Annotated[str, StringConstraints(max_length=MAX_BODY_LENGTH)]

    @model_validator(mode="after")
    def _check(self):
        self.body = self.body.strip()
        if not self.body:
            raise ValueError("message body must not be empty")
        return self


class RevisionOut(BaseModel):
    body: str
    created_at: datetime
