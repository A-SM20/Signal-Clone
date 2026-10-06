from datetime import datetime

from pydantic import BaseModel


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
