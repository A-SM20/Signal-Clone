from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationMember, Message
from app.repositories.conversations import not_blocked_by, visible_to


def _like_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def by_client_id(session: AsyncSession, sender_id: int, client_id: str) -> Message | None:
    return await session.scalar(select(Message).where(Message.sender_id == sender_id, Message.client_id == client_id))


async def page(
    session: AsyncSession, member: ConversationMember, before: int | None, limit: int
) -> tuple[list[Message], bool]:
    """Newest-first page inside the member's visibility window, cut by id cursor."""
    me = ConversationMember
    query = (
        select(Message)
        .join(me, (me.conversation_id == Message.conversation_id) & (me.user_id == member.user_id))
        .where(Message.conversation_id == member.conversation_id, visible_to(me), not_blocked_by(member.user_id))
        .order_by(Message.id.desc())
        .limit(limit + 1)
    )
    if before is not None:
        query = query.where(Message.id < before)
    rows = list(await session.scalars(query))
    return rows[:limit], len(rows) > limit


async def search(session: AsyncSession, viewer_id: int, query: str, limit: int) -> list[Message]:
    me = ConversationMember
    rows = await session.scalars(
        select(Message)
        .join(me, (me.conversation_id == Message.conversation_id) & (me.user_id == viewer_id))
        .where(
            visible_to(me),
            not_blocked_by(viewer_id),
            Message.deleted_at.is_(None),
            Message.kind != "system",
            Message.body.ilike(_like_pattern(query), escape="\\"),
        )
        .order_by(Message.id.desc())
        .limit(limit)
    )
    return list(rows)
