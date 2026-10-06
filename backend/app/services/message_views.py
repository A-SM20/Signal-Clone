"""Builds MessageOut DTOs in batches (one query per related table, never per message)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.models import Message
from app.schemas.messages import MessageOut, ReplyPreviewOut

REPLY_EXCERPT = 200


def _reply_preview(m: Message) -> ReplyPreviewOut:
    deleted = m.deleted_at is not None
    return ReplyPreviewOut(
        id=m.id,
        sender_id=m.sender_id,
        kind=m.kind,
        body=None if deleted or m.body is None else m.body[:REPLY_EXCERPT],
        deleted=deleted,
    )


def _base_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        client_id=m.client_id,
        kind=m.kind,
        body=m.body,
        system_event=m.system_event,
        created_at=m.created_at,
        edited_at=m.edited_at,
        deleted_at=m.deleted_at,
        expires_at=m.expires_at,
    )


async def message_out_many(
    session: AsyncSession, ctx: Ctx, messages: list[Message], viewer_id: int
) -> list[MessageOut]:
    """Later features (attachments, reactions, polls) extend this one function."""
    outs = [_base_out(m) for m in messages]
    from app.services import attachments  # avoid import cycle (attachments -> schemas only)

    from app.services import polls, reactions

    ids = [m.id for m in messages]
    files = await attachments.for_messages(session, ids)
    reacted = await reactions.for_messages(session, ids)
    poll_outs = await polls.for_messages(session, ids)
    for out in outs:
        out.attachments = [attachments.to_out(ctx, a) for a in files.get(out.id, [])]
        out.reactions = reacted.get(out.id, [])
        out.poll = poll_outs.get(out.id)
    reply_ids = {m.reply_to_id for m in messages if m.reply_to_id}
    if reply_ids:
        originals = {r.id: r for r in await session.scalars(select(Message).where(Message.id.in_(reply_ids)))}
        for out, m in zip(outs, messages):
            if m.reply_to_id in originals:
                out.reply_to = _reply_preview(originals[m.reply_to_id])
    return outs


async def message_out(session: AsyncSession, ctx: Ctx, message: Message, viewer_id: int) -> MessageOut:
    return (await message_out_many(session, ctx, [message], viewer_id))[0]
