import re

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import USERNAME_PATTERN
from app.context import Ctx
from app.errors import AppError
from app.models import Block, Contact, User
from app.services.phone import normalize_phone


async def find_user(session: AsyncSession, query: str) -> User | None:
    """Exact match only — by username, or by phone after normalisation. No fuzzy directory search."""
    query = query.strip()
    if re.fullmatch(USERNAME_PATTERN, query.lower()):
        return await session.scalar(select(User).where(User.username == query.lower()))
    try:
        phone = normalize_phone(query)
    except AppError:
        return None
    return await session.scalar(select(User).where(User.phone == phone))


async def is_contact(session: AsyncSession, owner_id: int, other_id: int) -> bool:
    found = await session.scalar(
        select(Contact.owner_id).where(Contact.owner_id == owner_id, Contact.contact_id == other_id)
    )
    return found is not None


async def is_blocked(session: AsyncSession, blocker_id: int, blocked_id: int) -> bool:
    found = await session.scalar(
        select(Block.blocker_id).where(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id)
    )
    return found is not None


async def add_contact(session: AsyncSession, ctx: Ctx, owner: User, query: str) -> User:
    other = await find_user(session, query)
    if other is None:
        raise AppError(404, "user_not_found", "No Signal user with that number or username")
    if other.id == owner.id:
        raise AppError(400, "cannot_add_self", "You can't add yourself")
    if await is_contact(session, owner.id, other.id):
        raise AppError(409, "already_contact", "Already in your contacts")
    session.add(Contact(owner_id=owner.id, contact_id=other.id, created_at=ctx.clock.now()))
    await session.commit()
    return other


async def list_contacts(session: AsyncSession, owner_id: int) -> list[User]:
    rows = await session.scalars(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(Contact.owner_id == owner_id)
        .order_by(User.display_name)
    )
    return list(rows)


async def remove_contact(session: AsyncSession, owner_id: int, other_id: int) -> None:
    await session.execute(delete(Contact).where(Contact.owner_id == owner_id, Contact.contact_id == other_id))
    await session.commit()


async def block(session: AsyncSession, ctx: Ctx, blocker_id: int, blocked_id: int) -> None:
    if blocker_id == blocked_id:
        raise AppError(400, "cannot_block_self", "You can't block yourself")
    if await session.get(User, blocked_id) is None:
        raise AppError(404, "user_not_found", "User not found")
    if not await is_blocked(session, blocker_id, blocked_id):
        session.add(Block(blocker_id=blocker_id, blocked_id=blocked_id, created_at=ctx.clock.now()))
        await session.commit()


async def unblock(session: AsyncSession, blocker_id: int, blocked_id: int) -> None:
    await session.execute(delete(Block).where(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id))
    await session.commit()


async def list_blocked(session: AsyncSession, blocker_id: int) -> list[User]:
    rows = await session.scalars(
        select(User).join(Block, Block.blocked_id == User.id).where(Block.blocker_id == blocker_id)
    )
    return list(rows)
