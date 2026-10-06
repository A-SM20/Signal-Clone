"""Pinned messages: max three per chat, timed or forever, optionally admins-only in groups."""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MAX_PINS
from app.context import Ctx
from app.errors import AppError
from app.models import Conversation, ConversationMember, Message, PinnedMessage
from app.repositories.messages import visible_ids
from app.realtime import events
from app.schemas.conversations import PinOut
from app.services.message_views import message_out_many

DURATIONS: dict[str, timedelta | None] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "forever": None,
}


async def pins_for(
    session: AsyncSession, ctx: Ctx, conversation_ids: list[int], viewer_id: int
) -> dict[int, list[PinOut]]:
    """Current pins per chat that `viewer_id` may see, newest first (the pinned bar starts with the latest).
    A pin is hidden if its message is outside the viewer's window, or it was pinned after they left."""
    if not conversation_ids:
        return {}
    rows = list(
        await session.scalars(
            select(PinnedMessage)
            .where(PinnedMessage.conversation_id.in_(conversation_ids))
            .order_by(PinnedMessage.pinned_at.desc(), PinnedMessage.message_id.desc())
        )
    )
    if not rows:
        return {}
    allowed = await visible_ids(session, viewer_id, [p.message_id for p in rows])
    left = {
        m.conversation_id: m.left_at
        for m in await session.scalars(
            select(ConversationMember).where(
                ConversationMember.user_id == viewer_id, ConversationMember.conversation_id.in_(conversation_ids)
            )
        )
    }
    rows = [
        p for p in rows
        if p.message_id in allowed and (left.get(p.conversation_id) is None or p.pinned_at <= left[p.conversation_id])
    ]
    if not rows:
        return {}
    messages = list(await session.scalars(select(Message).where(Message.id.in_([p.message_id for p in rows]))))
    outs = {o.id: o for o in await message_out_many(session, ctx, messages, viewer_id=0)}
    grouped: dict[int, list[PinOut]] = defaultdict(list)
    for p in rows:
        grouped[p.conversation_id].append(
            PinOut(
                message_id=p.message_id,
                pinned_by=p.pinned_by,
                pinned_at=p.pinned_at,
                expires_at=p.expires_at,
                message=outs[p.message_id],
            )
        )
    return grouped


async def publish_pins(session: AsyncSession, ctx: Ctx, conversation_id: int) -> None:
    from app.services.conversations import active_member_ids  # conversations imports this module

    for uid in await active_member_ids(session, conversation_id):  # each member sees only pins in their window
        pins = (await pins_for(session, ctx, [conversation_id], uid)).get(conversation_id, [])
        await ctx.hub.send_to_users([uid], events.pin_updated(conversation_id, pins))


async def _check_permission(session: AsyncSession, member: ConversationMember) -> None:
    conversation = await session.get_one(Conversation, member.conversation_id)
    if conversation.kind == "group" and conversation.pin_permission == "admins" and member.role != "admin":
        raise AppError(403, "not_admin", "Only admins can pin messages in this group")


async def pin(session: AsyncSession, ctx: Ctx, member: ConversationMember, message: Message, duration: str) -> None:
    await _check_permission(session, member)
    if message.deleted_at is not None:
        raise AppError(400, "message_deleted", "This message was deleted")
    if message.kind == "system":
        raise AppError(400, "not_pinnable", "This message can't be pinned")
    now = ctx.clock.now()
    span = DURATIONS[duration]
    existing = await session.get(PinnedMessage, (message.conversation_id, message.id))
    if existing is None:
        session.add(
            PinnedMessage(
                conversation_id=message.conversation_id,
                message_id=message.id,
                pinned_by=member.user_id,
                pinned_at=now,
                expires_at=now + span if span else None,
            )
        )
        await session.flush()
        current = list(
            await session.scalars(
                select(PinnedMessage)
                .where(PinnedMessage.conversation_id == message.conversation_id)
                .order_by(PinnedMessage.pinned_at.desc(), PinnedMessage.message_id.desc())
            )
        )
        for old in current[MAX_PINS:]:
            await session.delete(old)
    else:
        existing.pinned_by, existing.pinned_at = member.user_id, now
        existing.expires_at = now + span if span else None
    await session.commit()
    await publish_pins(session, ctx, message.conversation_id)


async def unpin(session: AsyncSession, ctx: Ctx, member: ConversationMember, message: Message) -> None:
    await _check_permission(session, member)
    existing = await session.get(PinnedMessage, (message.conversation_id, message.id))
    if existing is None:
        return
    await session.delete(existing)
    await session.commit()
    await publish_pins(session, ctx, message.conversation_id)


async def drop_for_message(session: AsyncSession, message: Message) -> bool:
    """Used by delete-for-everyone. Returns True if a pin was removed (caller publishes after commit)."""
    result = await session.execute(delete(PinnedMessage).where(PinnedMessage.message_id == message.id))
    return bool(result.rowcount)
