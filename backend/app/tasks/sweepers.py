"""Periodic cleanup jobs started by the app lifespan."""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.context import Ctx
from app.models import Message
from app.realtime import events
from app.services.attachments import purge_for_messages
from app.services.conversations import active_member_ids

log = logging.getLogger(__name__)


async def sweep_expired(session_factory: async_sessionmaker, ctx: Ctx) -> int:
    """Hard-deletes disappeared messages (and their files) and tells open chats. Returns the count."""
    async with session_factory() as session:
        expired = list(
            await session.execute(
                select(Message.id, Message.conversation_id).where(
                    Message.expires_at.is_not(None), Message.expires_at <= ctx.clock.now()
                )
            )
        )
        if not expired:
            return 0
        ids = [mid for mid, _ in expired]
        await purge_for_messages(session, ctx, ids)
        await session.execute(delete(Message).where(Message.id.in_(ids)))
        await session.commit()
        by_conversation: dict[int, list[int]] = defaultdict(list)
        for mid, cid in expired:
            by_conversation[cid].append(mid)
        for cid, mids in by_conversation.items():
            await ctx.hub.send_to_users(await active_member_ids(session, cid), events.message_removed(cid, sorted(mids)))
        return len(ids)


async def run_every(seconds: float, job: Callable[[], Awaitable[object]]) -> None:
    """Runs `job` forever at a fixed interval; errors are logged, never fatal."""
    while True:
        try:
            await job()
        except Exception:
            log.exception("periodic job failed")
        await asyncio.sleep(seconds)
