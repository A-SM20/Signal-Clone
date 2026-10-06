from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Conversation, ConversationMember, Message, User
from app.repositories import messages as repo
from app.schemas.messages import MessageOut, MessagePage, SendMessageIn
from app.services.conversations import active_member_ids, publish_message
from app.services import attachments, polls, requests
from app.services.message_views import message_out, message_out_many


async def _validate_reply(session: AsyncSession, conversation_id: int, reply_to_id: int | None, sender_id: int) -> None:
    if reply_to_id is None:
        return
    original = await session.get(Message, reply_to_id)
    if (
        original is None
        or original.conversation_id != conversation_id
        or original.kind == "system"
        or reply_to_id not in await repo.visible_ids(session, sender_id, [reply_to_id])
    ):
        raise AppError(400, "invalid_reply", "You can only reply to a message in this chat")


async def send_message(
    session: AsyncSession, ctx: Ctx, sender: User, member: ConversationMember, data: SendMessageIn
) -> tuple[MessageOut, bool]:
    """Returns (message, created). Replaying a client_id returns the stored message instead of a duplicate."""
    client_id = str(data.client_id)
    existing = await repo.by_client_id(session, sender.id, client_id)
    if existing is not None:
        return await message_out(session, ctx, existing, sender.id), False

    if member.request_state == "pending":
        raise AppError(403, "request_pending", "Accept the message request before replying")
    await _validate_reply(session, member.conversation_id, data.reply_to_id, sender.id)
    conversation = await session.get_one(Conversation, member.conversation_id)
    if conversation.kind == "direct":
        await requests.restore_direct_recipient(session, ctx, conversation, sender.id)
    now = ctx.clock.now()
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        client_id=client_id,
        kind=data.kind,
        body=data.body,
        reply_to_id=data.reply_to_id,
        created_at=now,
        # Simplification: the timer starts at send for everyone (Signal starts it when each reader sees it).
        expires_at=now + timedelta(seconds=conversation.disappearing_seconds) if conversation.disappearing_seconds else None,
    )
    session.add(message)
    try:
        await session.flush()
        await attachments.link(session, sender, message, data.attachment_ids)
        if data.poll is not None:
            await polls.create(session, message, data.poll)
    except IntegrityError:  # a concurrent retry won the race
        await session.rollback()
        existing = await repo.by_client_id(session, sender.id, client_id)
        return await message_out(session, ctx, existing, sender.id), False
    conversation.last_message_id = message.id
    conversation.last_activity_at = message.created_at
    await session.commit()
    await publish_message(session, ctx, message, await active_member_ids(session, conversation.id))
    return await message_out(session, ctx, message, sender.id), True


async def list_messages(
    session: AsyncSession, ctx: Ctx, member: ConversationMember, before: int | None, limit: int
) -> MessagePage:
    rows, has_more = await repo.page(session, member, before, limit)
    return MessagePage(items=await message_out_many(session, ctx, rows, member.user_id), has_more=has_more)
