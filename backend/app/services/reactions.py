from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Message, Reaction, User
from app.realtime import events
from app.schemas.messages import ReactionOut
from app.services.conversations import active_member_ids


async def for_messages(session: AsyncSession, message_ids: list[int]) -> dict[int, list[ReactionOut]]:
    grouped: dict[int, list[ReactionOut]] = defaultdict(list)
    if not message_ids:
        return grouped
    rows = await session.scalars(
        select(Reaction).where(Reaction.message_id.in_(message_ids)).order_by(Reaction.created_at)
    )
    for r in rows:
        grouped[r.message_id].append(ReactionOut(user_id=r.user_id, emoji=r.emoji))
    return grouped


async def _publish(session: AsyncSession, ctx: Ctx, message: Message) -> list[ReactionOut]:
    reactions = (await for_messages(session, [message.id])).get(message.id, [])
    await ctx.hub.send_to_users(
        await active_member_ids(session, message.conversation_id),
        events.reaction_updated(message.conversation_id, message.id, reactions),
    )
    return reactions


async def react(session: AsyncSession, ctx: Ctx, user: User, message: Message, emoji: str) -> list[ReactionOut]:
    if message.kind == "system" or message.deleted_at is not None:
        raise AppError(400, "cannot_react", "You can't react to this message")
    existing = await session.get(Reaction, (message.id, user.id))
    if existing is None:
        session.add(Reaction(message_id=message.id, user_id=user.id, emoji=emoji, created_at=ctx.clock.now()))
    else:
        existing.emoji = emoji
        existing.created_at = ctx.clock.now()
    await session.commit()
    return await _publish(session, ctx, message)


async def unreact(session: AsyncSession, ctx: Ctx, user: User, message: Message) -> list[ReactionOut]:
    await session.execute(delete(Reaction).where(Reaction.message_id == message.id, Reaction.user_id == user.id))
    await session.commit()
    return await _publish(session, ctx, message)
