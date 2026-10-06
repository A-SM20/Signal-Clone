"""Read queries for conversations. No business rules live here."""

from collections import defaultdict

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Conversation, ConversationMember, Message


def visible_to(member) -> ColumnElement[bool]:
    """Messages a member may see: from when they joined until they left (if they left)."""
    clause = Message.created_at >= member.joined_at
    return and_(clause, or_(member.left_at.is_(None), Message.created_at <= member.left_at))


async def membership(session: AsyncSession, conversation_id: int, user_id: int) -> ConversationMember | None:
    return await session.get(ConversationMember, (conversation_id, user_id))


async def conversations_for(session: AsyncSession, user_id: int) -> list[Conversation]:
    rows = await session.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user_id)
    )
    return list(rows)


async def members_by_conversation(
    session: AsyncSession, conversation_ids: list[int]
) -> dict[int, list[ConversationMember]]:
    rows = await session.scalars(
        select(ConversationMember)
        .where(ConversationMember.conversation_id.in_(conversation_ids))
        .options(selectinload(ConversationMember.user))
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    )
    grouped: dict[int, list[ConversationMember]] = defaultdict(list)
    for m in rows:
        grouped[m.conversation_id].append(m)
    return grouped


async def unread_counts(session: AsyncSession, viewer_id: int, conversation_ids: list[int]) -> dict[int, int]:
    """Messages from others after my read cursor, inside my visibility window (system notices excluded)."""
    me = ConversationMember
    rows = await session.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(me, and_(me.conversation_id == Message.conversation_id, me.user_id == viewer_id))
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.id > me.last_read_message_id,
            Message.sender_id != viewer_id,
            Message.kind != "system",
            Message.deleted_at.is_(None),
            visible_to(me),
        )
        .group_by(Message.conversation_id)
    )
    return {cid: count for cid, count in rows.all()}


async def latest_visible_messages(
    session: AsyncSession, viewer_id: int, conversation_ids: list[int]
) -> dict[int, Message]:
    me = ConversationMember
    latest_id = (
        select(func.max(Message.id))
        .join(me, and_(me.conversation_id == Message.conversation_id, me.user_id == viewer_id))
        .where(Message.conversation_id.in_(conversation_ids), visible_to(me))
        .group_by(Message.conversation_id)
    )
    rows = await session.scalars(select(Message).where(Message.id.in_(latest_id)))
    return {m.conversation_id: m for m in rows}


async def latest_message_id(session: AsyncSession, conversation_id: int) -> int:
    return await session.scalar(
        select(func.coalesce(func.max(Message.id), 0)).where(Message.conversation_id == conversation_id)
    )
