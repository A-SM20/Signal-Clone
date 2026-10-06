from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Conversation, ConversationMember, Message, User
from app.repositories import messages as repo
from app.schemas.messages import MessageOut, MessagePage, SendMessageIn
from app.services.conversations import active_member_ids, publish_message
from app.services.message_views import message_out, message_out_many


async def _validate_reply(session: AsyncSession, conversation_id: int, reply_to_id: int | None) -> None:
    if reply_to_id is None:
        return
    original = await session.get(Message, reply_to_id)
    if original is None or original.conversation_id != conversation_id or original.kind == "system":
        raise AppError(400, "invalid_reply", "You can only reply to a message in this chat")


async def send_message(
    session: AsyncSession, ctx: Ctx, sender: User, member: ConversationMember, data: SendMessageIn
) -> tuple[MessageOut, bool]:
    """Returns (message, created). Replaying a client_id returns the stored message instead of a duplicate."""
    client_id = str(data.client_id)
    existing = await repo.by_client_id(session, sender.id, client_id)
    if existing is not None:
        return await message_out(session, ctx, existing, sender.id), False

    await _validate_reply(session, member.conversation_id, data.reply_to_id)
    conversation = await session.get_one(Conversation, member.conversation_id)
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        client_id=client_id,
        kind=data.kind,
        body=data.body,
        reply_to_id=data.reply_to_id,
        created_at=ctx.clock.now(),
    )
    session.add(message)
    try:
        await session.flush()
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
