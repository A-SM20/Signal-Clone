from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import AVATAR_COLORS
from app.context import Ctx
from app.errors import AppError
from app.models import Block, Conversation, ConversationMember, Message, User
from app.realtime import events
from app.repositories import conversations as repo
from app.schemas.conversations import ConversationOut, MemberOut, MyStateOut
from app.services.message_views import message_out, message_out_many
from app.services.contacts import is_contact
from app.services.receipts import visible_cursors
from app.services.safety_numbers import verification_state
from app.services.users import avatar_url, get_settings, settings_for, to_user_out

# ---------------------------------------------------------------- views


async def build_views(
    session: AsyncSession, ctx: Ctx, conversations: list[Conversation], viewer_id: int
) -> list[ConversationOut]:
    if not conversations:
        return []
    ids = [c.id for c in conversations]
    members = await repo.members_by_conversation(session, ids)
    prefs = await settings_for(session, {m.user_id for ms in members.values() for m in ms})
    unread = await repo.unread_counts(session, viewer_id, ids)
    latest = await repo.latest_visible_messages(session, viewer_id, ids)
    latest_out = {
        m.conversation_id: out
        for m, out in zip(latest.values(), await message_out_many(session, ctx, list(latest.values()), viewer_id))
    }
    from app.services.pins import pins_for  # pins imports this module's helpers lazily too

    pins = await pins_for(session, ctx, ids, viewer_id)
    views = []
    for c in conversations:
        ms = members[c.id]
        mine = next(m for m in ms if m.user_id == viewer_id)
        others = [m for m in ms if m.user_id != viewer_id]
        member_outs = []
        for m in ms:
            delivered, read = visible_cursors(m, viewer_id, prefs.get(viewer_id), prefs.get(m.user_id))
            member_outs.append(
                MemberOut(
                    user=to_user_out(m.user, ctx, prefs.get(m.user_id)),
                    role=m.role,
                    request_state="pending" if m.request_state == "deleted" else m.request_state,
                    joined_at=m.joined_at,
                    left_at=m.left_at,
                    last_delivered_message_id=delivered,
                    last_read_message_id=read,
                )
            )
        is_note_to_self = c.kind == "direct" and len(set((c.direct_key or "").split(":"))) == 1
        changed = False
        if c.kind == "group":
            title, url, color = c.title or "Group", avatar_url(ctx, c.avatar_path), AVATAR_COLORS[c.id % len(AVATAR_COLORS)]
        elif is_note_to_self:
            title, url, color = "Note to Self", avatar_url(ctx, mine.user.avatar_path), mine.user.avatar_color
        else:
            other = others[0].user
            title, url, color = other.display_name, avatar_url(ctx, other.avatar_path), other.avatar_color
            changed = (await verification_state(session, viewer_id, other))[1]
        views.append(
            ConversationOut(
                id=c.id,
                kind=c.kind,
                title=title,
                description=c.description,
                avatar_url=url,
                avatar_color=color,
                is_note_to_self=is_note_to_self,
                disappearing_seconds=c.disappearing_seconds,
                pin_permission=c.pin_permission,
                members=member_outs,
                me=MyStateOut(
                    role=mine.role,
                    request_state=mine.request_state,
                    muted_until=mine.muted_until,
                    is_archived=mine.is_archived,
                    is_pinned=mine.is_pinned,
                    last_read_message_id=mine.last_read_message_id,
                    left_at=mine.left_at,
                ),
                unread_count=unread.get(c.id, 0),
                last_message=latest_out.get(c.id),
                last_activity_at=c.last_activity_at,
                safety_number_changed=changed,
                pins=pins.get(c.id, []),
            )
        )
    return views


async def conversation_out(session: AsyncSession, ctx: Ctx, conversation_id: int, viewer_id: int) -> ConversationOut:
    conversation = await session.get_one(Conversation, conversation_id)
    return (await build_views(session, ctx, [conversation], viewer_id))[0]


async def list_conversations(session: AsyncSession, ctx: Ctx, viewer_id: int) -> list[ConversationOut]:
    views = await build_views(session, ctx, await repo.conversations_for(session, viewer_id), viewer_id)
    return sorted(views, key=lambda v: (not v.me.is_pinned, -v.last_activity_at.timestamp()))


# ---------------------------------------------------------------- realtime


async def active_member_ids(session: AsyncSession, conversation_id: int) -> list[int]:
    rows = await session.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.left_at.is_(None),
            ConversationMember.request_state != "deleted",
        )
    )
    return list(rows)


async def publish_conversation(session: AsyncSession, ctx: Ctx, conversation_id: int, user_ids: Iterable[int]) -> None:
    """Each recipient gets their own view (my-state and unread counts differ per user)."""
    for uid in set(user_ids):
        view = await conversation_out(session, ctx, conversation_id, uid)
        await ctx.hub.send_to_users([uid], events.conversation_updated(view))


async def publish_message(session: AsyncSession, ctx: Ctx, message: Message, user_ids: Iterable[int]) -> None:
    recipients = set(user_ids)
    if message.sender_id is not None:  # silent blocking: people who blocked the sender get nothing
        blockers = await session.scalars(select(Block.blocker_id).where(Block.blocked_id == message.sender_id))
        recipients -= set(blockers)
    out = await message_out(session, ctx, message, viewer_id=0)
    await ctx.hub.send_to_users(recipients, events.message_created(out))


async def initial_request_state(session: AsyncSession, recipient_id: int, initiator_id: int) -> str:
    """A chat started (or group invite sent) by someone not in the recipient's contacts is a request."""
    if recipient_id == initiator_id or await is_contact(session, recipient_id, initiator_id):
        return "accepted"
    return "pending"


# ---------------------------------------------------------------- writes


def _touch(conversation: Conversation, message: Message) -> None:
    conversation.last_message_id = message.id
    conversation.last_activity_at = message.created_at


async def post_system_message(session: AsyncSession, ctx: Ctx, conversation: Conversation, event: dict) -> Message:
    message = Message(
        conversation_id=conversation.id, sender_id=None, kind="system", system_event=event, created_at=ctx.clock.now()
    )
    session.add(message)
    await session.flush()
    _touch(conversation, message)
    return message


async def _require_user(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(404, "user_not_found", "User not found")
    return user


async def get_or_create_direct(session: AsyncSession, ctx: Ctx, me: User, other_id: int) -> tuple[Conversation, bool]:
    await _require_user(session, other_id)
    key = f"{min(me.id, other_id)}:{max(me.id, other_id)}"
    existing = await session.scalar(select(Conversation).where(Conversation.direct_key == key))
    if existing is not None:
        mine = await session.get(ConversationMember, (existing.id, me.id))
        if mine is not None and mine.request_state == "deleted":  # I deleted their request, now I write first
            mine.request_state, mine.joined_at = "accepted", ctx.clock.now()
            await session.commit()
        return existing, False
    now = ctx.clock.now()
    timer = (await get_settings(session, me.id)).default_disappearing_seconds
    conversation = Conversation(
        kind="direct", direct_key=key, created_by=me.id, created_at=now, last_activity_at=now, disappearing_seconds=timer
    )
    session.add(conversation)
    await session.flush()
    for uid in {me.id, other_id}:
        state = await initial_request_state(session, uid, me.id)
        session.add(ConversationMember(conversation_id=conversation.id, user_id=uid, joined_at=now, request_state=state))
    await session.commit()
    return conversation, True


async def create_group(
    session: AsyncSession, ctx: Ctx, me: User, title: str, member_ids: list[int], description: str | None
) -> Conversation:
    others = [uid for uid in member_ids if uid != me.id]
    for uid in others:
        await _require_user(session, uid)
    now = ctx.clock.now()
    conversation = Conversation(
        kind="group",
        title=title,
        description=description,
        created_by=me.id,
        created_at=now,
        last_activity_at=now,
        disappearing_seconds=(await get_settings(session, me.id)).default_disappearing_seconds,
    )
    session.add(conversation)
    await session.flush()
    session.add(ConversationMember(conversation_id=conversation.id, user_id=me.id, role="admin", joined_at=now))
    for uid in others:
        state = await initial_request_state(session, uid, me.id)
        session.add(ConversationMember(conversation_id=conversation.id, user_id=uid, joined_at=now, request_state=state))
    created = await post_system_message(session, ctx, conversation, {"type": "group_created", "actor_id": me.id})
    msgs = [created]
    if others:
        msgs.append(
            await post_system_message(
                session, ctx, conversation, {"type": "member_added", "actor_id": me.id, "user_ids": others}
            )
        )
    await session.commit()
    await publish_conversation(session, ctx, conversation.id, others)
    return conversation


async def update_conversation(
    session: AsyncSession, ctx: Ctx, me: User, conversation: Conversation, changes: dict
) -> None:
    """Group info (groups only) and the disappearing-message timer (any chat)."""
    if conversation.kind != "group" and ({"title", "description", "pin_permission"} & changes.keys()):
        raise AppError(400, "not_a_group", "Only groups have a title and description")
    notices = []
    seconds = changes.get("disappearing_seconds")
    if seconds is not None and seconds != conversation.disappearing_seconds:
        conversation.disappearing_seconds = seconds
        notices.append({"type": "timer_changed", "actor_id": me.id, "seconds": seconds})
    if "title" in changes and changes["title"] and changes["title"] != conversation.title:
        conversation.title = changes["title"]
        notices.append({"type": "title_changed", "actor_id": me.id, "title": conversation.title})
    if "description" in changes:
        conversation.description = changes["description"]
    if changes.get("pin_permission"):
        conversation.pin_permission = changes["pin_permission"]
    messages = [await post_system_message(session, ctx, conversation, n) for n in notices]
    await session.commit()
    recipients = await active_member_ids(session, conversation.id)
    for m in messages:
        await publish_message(session, ctx, m, recipients)
    await publish_conversation(session, ctx, conversation.id, recipients)


async def update_my_state(session: AsyncSession, member: ConversationMember, changes: dict) -> None:
    for field in ("muted_until", "is_archived", "is_pinned"):
        if field in changes and (changes[field] is not None or field == "muted_until"):
            setattr(member, field, changes[field])
    await session.commit()


async def add_members(session: AsyncSession, ctx: Ctx, me: User, conversation: Conversation, user_ids: list[int]) -> None:
    if conversation.kind != "group":
        raise AppError(400, "not_a_group", "Members can only be added to groups")
    now = ctx.clock.now()
    added = []
    for uid in dict.fromkeys(user_ids):
        await _require_user(session, uid)
        existing = await repo.membership(session, conversation.id, uid)
        if existing is not None and existing.left_at is None and existing.request_state != "deleted":
            continue
        state = await initial_request_state(session, uid, me.id)
        if existing is not None:  # re-joining: fresh window, no access to the gap
            existing.left_at, existing.joined_at, existing.role, existing.request_state = None, now, "member", state
        else:
            session.add(ConversationMember(conversation_id=conversation.id, user_id=uid, joined_at=now, request_state=state))
        added.append(uid)
    if not added:
        return
    await session.flush()
    notice = await post_system_message(
        session, ctx, conversation, {"type": "member_added", "actor_id": me.id, "user_ids": added}
    )
    await session.commit()
    recipients = await active_member_ids(session, conversation.id)
    await publish_message(session, ctx, notice, recipients)
    await publish_conversation(session, ctx, conversation.id, recipients)


async def _ensure_an_admin(session: AsyncSession, conversation_id: int) -> None:
    """If no active admin remains, promote the longest-standing active member."""
    active = await session.scalars(
        select(ConversationMember)
        .where(ConversationMember.conversation_id == conversation_id, ConversationMember.left_at.is_(None))
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    )
    active = list(active)
    if active and not any(m.role == "admin" for m in active):
        active[0].role = "admin"


async def remove_member(
    session: AsyncSession, ctx: Ctx, actor: User, conversation: Conversation, target: ConversationMember
) -> None:
    """Admin removal, or the actor leaving when target is themselves. History up to now is kept."""
    if conversation.kind != "group":
        raise AppError(400, "not_a_group", "You can't leave a direct chat")
    leaving = target.user_id == actor.id
    now: datetime = ctx.clock.now()
    event = (
        {"type": "member_left", "user_id": actor.id}
        if leaving
        else {"type": "member_removed", "actor_id": actor.id, "user_ids": [target.user_id]}
    )
    # Post the notice first so the departing member's window still includes it.
    notice = await post_system_message(session, ctx, conversation, event)
    target.left_at = now
    target.role = "member"
    await session.flush()
    await _ensure_an_admin(session, conversation.id)
    await session.commit()
    recipients = await active_member_ids(session, conversation.id)
    await publish_message(session, ctx, notice, [*recipients, target.user_id])
    await publish_conversation(session, ctx, conversation.id, [*recipients, target.user_id])


async def set_role(
    session: AsyncSession, ctx: Ctx, actor: User, conversation: Conversation, target: ConversationMember, role: str
) -> None:
    if target.left_at is not None:
        raise AppError(404, "not_found", "Not a member")
    if target.role == role:
        return
    target.role = role
    notice = await post_system_message(
        session, ctx, conversation, {"type": "role_changed", "actor_id": actor.id, "user_id": target.user_id, "role": role}
    )
    await session.flush()
    await _ensure_an_admin(session, conversation.id)
    await session.commit()
    recipients = await active_member_ids(session, conversation.id)
    await publish_message(session, ctx, notice, recipients)
    await publish_conversation(session, ctx, conversation.id, recipients)
