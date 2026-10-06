from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.models import ConversationMember, Message, User, UserSettings
from app.realtime import events
from app.repositories.conversations import latest_message_id, membership
from app.services.status import MemberCursor, Status, derive_status
from app.services.users import settings_for


def visible_cursors(
    member: ConversationMember,
    viewer_id: int,
    viewer_settings: UserSettings | None,
    member_settings: UserSettings | None,
) -> tuple[int | None, int | None]:
    """What `viewer` may know about `member`'s receipt cursors.

    Read receipts are reciprocal (as in Signal): if either side disabled them, the
    read cursor is hidden. Your own cursors are always visible to you.
    """
    if member.user_id == viewer_id:
        return member.last_delivered_message_id, member.last_read_message_id
    if member.request_state in ("pending", "deleted"):  # an unaccepted request leaks nothing
        return None, None
    reads_shared = (viewer_settings is None or viewer_settings.read_receipts) and (
        member_settings is None or member_settings.read_receipts
    )
    return member.last_delivered_message_id, member.last_read_message_id if reads_shared else None


async def advance_cursor(
    session: AsyncSession,
    ctx: Ctx,
    user: User,
    conversation_id: int,
    kind: Literal["delivered", "read"],
    up_to: int,
) -> None:
    member = await membership(session, conversation_id, user.id)
    if member is None or member.left_at is not None:
        return
    up_to = min(up_to, await latest_message_id(session, conversation_id))
    changed = False
    if kind == "read" and up_to > member.last_read_message_id:
        member.last_read_message_id = up_to
        changed = True
    if up_to > member.last_delivered_message_id:  # reading implies delivery
        member.last_delivered_message_id = up_to
        changed = True
    if not changed:
        return
    await session.commit()
    await _broadcast_receipt(session, ctx, member)


async def _broadcast_receipt(session: AsyncSession, ctx: Ctx, member: ConversationMember) -> None:
    others = list(
        await session.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == member.conversation_id,
                ConversationMember.left_at.is_(None),
                ConversationMember.user_id != member.user_id,
            )
        )
    )
    prefs = await settings_for(session, {member.user_id, *others})
    for uid in others:
        delivered, read = visible_cursors(member, uid, prefs.get(uid), prefs.get(member.user_id))
        if delivered is None and read is None:
            continue
        await ctx.hub.send_to_users(
            [uid], events.receipt_updated(member.conversation_id, member.user_id, delivered, read)
        )


async def relay_typing(session: AsyncSession, ctx: Ctx, user_id: int, conversation_id: int, state: str) -> None:
    member = await membership(session, conversation_id, user_id)
    if member is None or member.left_at is not None or member.request_state in ("pending", "deleted"):
        return
    others = list(
        await session.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.left_at.is_(None),
                ConversationMember.user_id != user_id,
            )
        )
    )
    prefs = await settings_for(session, {user_id, *others})
    if not prefs[user_id].typing_indicators:
        return
    recipients = [uid for uid in others if prefs[uid].typing_indicators]
    await ctx.hub.send_to_users(recipients, events.typing(conversation_id, user_id, state))


async def message_details(
    session: AsyncSession, message: Message, viewer_id: int
) -> list[tuple[int, Status]]:
    """Per-recipient status for the sender's Message details view."""
    members = list(
        await session.scalars(
            select(ConversationMember).where(ConversationMember.conversation_id == message.conversation_id)
        )
    )
    prefs = await settings_for(session, {m.user_id for m in members})
    result = []
    for m in members:
        if m.user_id == viewer_id or (m.left_at is not None and m.left_at < message.created_at):
            continue
        delivered, read = visible_cursors(m, viewer_id, prefs.get(viewer_id), prefs.get(m.user_id))
        status = derive_status(message.id, viewer_id, [MemberCursor(m.user_id, delivered, read, True)])
        result.append((m.user_id, status))
    return result
