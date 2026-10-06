"""Polls: single or multiple choice, live non-anonymous tallies, creator can end."""

from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Message, Poll, PollOption, PollVote, User
from app.realtime import events
from app.schemas.messages import PollIn, PollOptionOut, PollOut


async def create(session: AsyncSession, message: Message, data: PollIn) -> None:
    session.add(Poll(message_id=message.id, question=data.question, allow_multiple=data.allow_multiple))
    await session.flush()
    session.add_all(
        PollOption(poll_message_id=message.id, position=i, text=text) for i, text in enumerate(data.options)
    )


async def for_messages(session: AsyncSession, message_ids: list[int]) -> dict[int, PollOut]:
    if not message_ids:
        return {}
    polls = {p.message_id: p for p in await session.scalars(select(Poll).where(Poll.message_id.in_(message_ids)))}
    if not polls:
        return {}
    options = list(
        await session.scalars(
            select(PollOption).where(PollOption.poll_message_id.in_(polls.keys())).order_by(PollOption.position)
        )
    )
    voters: dict[int, list[int]] = defaultdict(list)
    for option_id, user_id in await session.execute(
        select(PollVote.option_id, PollVote.user_id)
        .where(PollVote.option_id.in_([o.id for o in options]))
        .order_by(PollVote.voted_at, PollVote.user_id)
    ):
        voters[option_id].append(user_id)
    by_poll: dict[int, list[PollOptionOut]] = defaultdict(list)
    for o in options:
        ids = voters.get(o.id, [])
        by_poll[o.poll_message_id].append(PollOptionOut(id=o.id, text=o.text, vote_count=len(ids), voter_ids=ids))
    return {
        mid: PollOut(question=p.question, allow_multiple=p.allow_multiple, ended_at=p.ended_at, options=by_poll[mid])
        for mid, p in polls.items()
    }


async def get_poll(session: AsyncSession, message_id: int) -> Poll:
    poll = await session.get(Poll, message_id)
    if poll is None:
        raise AppError(404, "not_found", "Poll not found")
    return poll


async def _publish(session: AsyncSession, ctx: Ctx, message: Message) -> PollOut:
    from app.services.conversations import active_member_ids

    out = (await for_messages(session, [message.id]))[message.id]
    await ctx.hub.send_to_users(
        await active_member_ids(session, message.conversation_id),
        events.poll_updated(message.conversation_id, message.id, out.options, out.ended_at),
    )
    return out


async def vote(session: AsyncSession, ctx: Ctx, user: User, message: Message, option_ids: list[int]) -> PollOut:
    poll = await get_poll(session, message.id)
    if poll.ended_at is not None:
        raise AppError(400, "poll_ended", "This poll has ended")
    chosen = set(option_ids)
    if len(chosen) > 1 and not poll.allow_multiple:
        raise AppError(422, "single_choice", "This poll allows one choice")
    valid = set(await session.scalars(select(PollOption.id).where(PollOption.poll_message_id == poll.message_id)))
    if not chosen <= valid:
        raise AppError(422, "invalid_option", "That option isn't part of this poll")
    await session.execute(delete(PollVote).where(PollVote.user_id == user.id, PollVote.option_id.in_(valid)))
    now = ctx.clock.now()
    session.add_all(PollVote(option_id=oid, user_id=user.id, voted_at=now) for oid in sorted(chosen))
    await session.commit()
    return await _publish(session, ctx, message)


async def end(session: AsyncSession, ctx: Ctx, user: User, message: Message) -> PollOut:
    poll = await get_poll(session, message.id)
    if message.sender_id != user.id:
        raise AppError(403, "not_creator", "Only the person who created the poll can end it")
    if poll.ended_at is None:
        poll.ended_at = ctx.clock.now()
        await session.commit()
    return await _publish(session, ctx, message)


async def purge(session: AsyncSession, message_id: int) -> None:
    """Delete-for-everyone removes the poll with its options and votes (FK cascades are not relied on)."""
    option_ids = select(PollOption.id).where(PollOption.poll_message_id == message_id)
    await session.execute(delete(PollVote).where(PollVote.option_id.in_(option_ids)))
    await session.execute(delete(PollOption).where(PollOption.poll_message_id == message_id))
    await session.execute(delete(Poll).where(Poll.message_id == message_id))
