"""Builds the demo database. Runs only when the users table is empty."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clock import Clock
from app.config import Settings
from app.models import Conversation, ConversationMember, Message, User


@dataclass
class SeedContext:
    session: AsyncSession
    now: datetime
    settings: Settings
    users: dict[str, User] = field(default_factory=dict)
    convs: dict[str, Conversation] = field(default_factory=dict)
    message_ids: dict[str, list[int]] = field(default_factory=dict)

    def ago(self, minutes: float) -> datetime:
        return self.now - timedelta(minutes=minutes)

    async def add_message(
        self, conv_key: str, sender_key: str | None, body: str | None, minutes_ago: float, **fields
    ) -> Message:
        conv = self.convs[conv_key]
        message = Message(
            conversation_id=conv.id,
            sender_id=self.users[sender_key].id if sender_key else None,
            kind=fields.pop("kind", "text" if sender_key else "system"),
            body=body,
            created_at=self.ago(minutes_ago),
            **fields,
        )
        self.session.add(message)
        await self.session.flush()
        conv.last_message_id = message.id
        conv.last_activity_at = message.created_at
        self.message_ids.setdefault(conv_key, []).append(message.id)
        return message

    async def set_cursors(self, conv_key: str, user_key: str, delivered: int, read: int) -> None:
        member = await self.session.get_one(
            ConversationMember, (self.convs[conv_key].id, self.users[user_key].id)
        )
        member.last_delivered_message_id = delivered
        member.last_read_message_id = read


async def seed_database(session_factory: async_sessionmaker, settings: Settings, clock: Clock) -> None:
    from app.seed.features import FEATURE_SEEDERS

    async with session_factory() as session:
        if await session.scalar(select(func.count(User.id))):
            return
        ctx = SeedContext(session=session, now=clock.now(), settings=settings)
        for seeder in FEATURE_SEEDERS:
            await seeder(ctx)
        await session.commit()
