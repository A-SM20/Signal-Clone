"""Edit, delete for everyone, delete for me — Signal's rules: sender only, within 24 hours."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DELETE_FOR_EVERYONE_WINDOW, EDIT_WINDOW
from app.context import Ctx
from app.errors import AppError
from app.models import Block, HiddenMessage, Message, MessageRevision, Reaction, User
from app.realtime import events
from app.schemas.messages import MessageOut, RevisionOut
from app.services.attachments import purge_for_messages
from app.services.conversations import active_member_ids
from app.services import pins
from app.services.message_views import message_out

EDITABLE_KINDS = {"text"}


async def _publish_update(session: AsyncSession, ctx: Ctx, message: Message) -> MessageOut:
    out = await message_out(session, ctx, message, viewer_id=0)
    recipients = set(await active_member_ids(session, message.conversation_id))
    if message.sender_id is not None:  # silent blocking, as for new messages
        recipients -= set(await session.scalars(select(Block.blocker_id).where(Block.blocked_id == message.sender_id)))
    await ctx.hub.send_to_users(recipients, events.message_updated(out))
    return out


def _check_sender(message: Message, user: User) -> None:
    if message.sender_id != user.id:
        raise AppError(403, "not_sender", "Only the sender can do this")


async def edit_message(session: AsyncSession, ctx: Ctx, user: User, message: Message, body: str) -> MessageOut:
    _check_sender(message, user)
    if message.deleted_at is not None:
        raise AppError(400, "message_deleted", "This message was deleted")
    if message.kind not in EDITABLE_KINDS:
        raise AppError(400, "not_editable", "Only text messages can be edited")
    now = ctx.clock.now()
    if now - message.created_at > EDIT_WINDOW:
        raise AppError(403, "edit_window_passed", "Messages can only be edited for 24 hours")
    if body == message.body:
        return await message_out(session, ctx, message, user.id)
    session.add(MessageRevision(message_id=message.id, body=message.body or "", created_at=now))
    message.body = body
    message.edited_at = now
    await session.commit()
    return await _publish_update(session, ctx, message)


async def revisions(session: AsyncSession, message: Message) -> list[RevisionOut]:
    if message.deleted_at is not None:
        return []
    rows = await session.scalars(
        select(MessageRevision).where(MessageRevision.message_id == message.id).order_by(MessageRevision.id)
    )
    return [RevisionOut(body=r.body, created_at=r.created_at) for r in rows]


async def delete_for_everyone(session: AsyncSession, ctx: Ctx, user: User, message: Message) -> None:
    _check_sender(message, user)
    if message.deleted_at is not None:
        return
    now = ctx.clock.now()
    if now - message.created_at > DELETE_FOR_EVERYONE_WINDOW:
        raise AppError(403, "delete_window_passed", "Messages can only be deleted for everyone for 24 hours")
    await purge_for_messages(session, ctx, [message.id])
    await session.execute(delete(Reaction).where(Reaction.message_id == message.id))
    await session.execute(delete(MessageRevision).where(MessageRevision.message_id == message.id))
    unpinned = await pins.drop_for_message(session, message)
    message.body = None
    message.deleted_at = now
    await session.commit()
    await _publish_update(session, ctx, message)
    if unpinned:
        await pins.publish_pins(session, ctx, message.conversation_id)


async def delete_for_me(session: AsyncSession, ctx: Ctx, user: User, message: Message) -> None:
    if await session.get(HiddenMessage, (user.id, message.id)) is None:
        session.add(HiddenMessage(user_id=user.id, message_id=message.id, hidden_at=ctx.clock.now()))
        await session.commit()
    # My other devices drop it too.
    await ctx.hub.send_to_users([user.id], events.message_removed(message.conversation_id, [message.id]))
