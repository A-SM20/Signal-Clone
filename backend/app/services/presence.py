from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.context import Ctx
from app.models import Contact, ConversationMember, User
from app.realtime import events
from app.services.users import get_settings


async def related_user_ids(session: AsyncSession, user_id: int) -> set[int]:
    """Users allowed to see this user's presence: contacts in either direction + co-members of active chats."""
    in_their_contacts = select(Contact.owner_id).where(Contact.contact_id == user_id)
    in_my_contacts = select(Contact.contact_id).where(Contact.owner_id == user_id)
    me = aliased(ConversationMember)
    other = aliased(ConversationMember)
    co_members = (
        select(other.user_id)
        .join(me, me.conversation_id == other.conversation_id)
        .where(me.user_id == user_id, me.left_at.is_(None), other.left_at.is_(None))
    )
    ids: set[int] = set()
    for query in (in_their_contacts, in_my_contacts, co_members):
        ids.update(await session.scalars(query))
    ids.discard(user_id)
    return ids


async def broadcast_presence(session: AsyncSession, ctx: Ctx, user_id: int, online: bool) -> None:
    """Called on online/offline transitions. Going offline stamps last_seen_at."""
    user = await session.get_one(User, user_id)
    if not online:
        user.last_seen_at = ctx.clock.now()
        await session.commit()
    settings = await get_settings(session, user_id)
    if settings.share_last_seen:
        event = events.presence(user_id, online, user.last_seen_at)
    else:
        event = events.presence(user_id, False, None)
    await ctx.hub.send_to_users(await related_user_ids(session, user_id), event)
