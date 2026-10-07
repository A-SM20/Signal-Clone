"""Message requests: strangers' chats wait for Accept / Block / Delete, as in Signal."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Block, Conversation, ConversationMember
from app.realtime import events
from app.services.contacts import is_blocked


async def restore_direct_recipient(session: AsyncSession, ctx: Ctx, conversation: Conversation, sender_id: int) -> None:
    """If the other person deleted this request, a new message re-opens it as a request — unless they blocked us."""
    a, b = (int(x) for x in conversation.direct_key.split(":"))
    other = b if a == sender_id else a
    if other == sender_id:
        return
    row = await session.get(ConversationMember, (conversation.id, other))
    if row is not None and row.request_state != "deleted":
        return
    if await is_blocked(session, other, sender_id):
        return
    if row is None:
        session.add(
            ConversationMember(conversation_id=conversation.id, user_id=other, joined_at=ctx.clock.now(), request_state="pending")
        )
    else:  # they deleted the earlier request: it comes back as a fresh request without the old history
        row.request_state, row.joined_at = "pending", ctx.clock.now()
    await session.flush()


def _other_party(conversation: Conversation, me_id: int) -> int | None:
    if conversation.kind == "direct" and conversation.direct_key:
        a, b = (int(x) for x in conversation.direct_key.split(":"))
        return b if a == me_id else a
    return conversation.created_by


async def resolve(session: AsyncSession, ctx: Ctx, member: ConversationMember, action: str) -> bool:
    """Returns True if the conversation is still visible to the member afterwards."""
    if member.request_state != "pending":
        raise AppError(400, "not_a_request", "This chat isn't a message request")
    conversation = await session.get_one(Conversation, member.conversation_id)
    if action == "accept":
        member.request_state = "accepted"
        other = _other_party(conversation, member.user_id)
        if other and other != member.user_id:
            from app.services.contacts import is_contact, Contact
            if not await is_contact(session, member.user_id, other):
                session.add(Contact(owner_id=member.user_id, contact_id=other, created_at=ctx.clock.now()))
        await session.commit()
        from app.services.conversations import active_member_ids, publish_conversation

        await publish_conversation(session, ctx, conversation.id, await active_member_ids(session, conversation.id))
        return True

    if action == "block":
        other = _other_party(conversation, member.user_id)
        if other and other != member.user_id and not await is_blocked(session, member.user_id, other):
            session.add(Block(blocker_id=member.user_id, blocked_id=other, created_at=ctx.clock.now()))
    # Block and delete both drop the request from my list. The row stays (marked "deleted") so the
    # sender's view of the chat doesn't change — they are not told.
    user_id = member.user_id
    member.request_state = "deleted"
    await session.commit()
    await ctx.hub.send_to_users([user_id], events.conversation_removed(conversation.id))
    return False


async def pending_ids(session: AsyncSession, user_id: int) -> list[int]:
    return list(
        await session.scalars(
            select(ConversationMember.conversation_id).where(
                ConversationMember.user_id == user_id, ConversationMember.request_state == "pending"
            )
        )
    )
