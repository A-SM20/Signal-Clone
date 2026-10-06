"""Seeders run in order; later features append their own seed_<feature> to FEATURE_SEEDERS."""

from collections.abc import Awaitable, Callable

from sqlalchemy import select

from app.constants import AVATAR_COLORS
from app.models import Attachment, Contact, Reaction, Conversation, ConversationMember, User, UserSettings
from app.seed.build import SeedContext
from app.seed.data import CONTACT_PAIRS, DIRECTS, GROUPS, SCRIPTS, USERS
from app.seed.media import landscape, pdf_document, store
from app.services.auth import new_identity_key

GROUP_CREATED_BEFORE_FIRST_LINE = 30  # minutes


async def _users(ctx: SeedContext) -> None:
    for key, phone, name, username, about in USERS:
        user = User(
            phone=phone,
            display_name=name,
            username=username,
            about=about,
            avatar_color=AVATAR_COLORS[0],
            identity_key=new_identity_key(),
            created_at=ctx.ago(60 * 24 * 60),
            last_seen_at=ctx.ago(45),
        )
        ctx.session.add(user)
        await ctx.session.flush()
        user.avatar_color = AVATAR_COLORS[user.id % len(AVATAR_COLORS)]
        ctx.session.add(UserSettings(user_id=user.id))
        ctx.users[key] = user
    for a, b in CONTACT_PAIRS:
        ctx.session.add(Contact(owner_id=ctx.users[a].id, contact_id=ctx.users[b].id, created_at=ctx.ago(50 * 24 * 60)))
        ctx.session.add(Contact(owner_id=ctx.users[b].id, contact_id=ctx.users[a].id, created_at=ctx.ago(50 * 24 * 60)))


async def _conversations(ctx: SeedContext) -> None:
    joined = ctx.ago(30 * 24 * 60)
    for key, (a, b) in DIRECTS.items():
        ua, ub = ctx.users[a], ctx.users[b]
        conv = Conversation(
            kind="direct",
            direct_key=f"{min(ua.id, ub.id)}:{max(ua.id, ub.id)}",
            created_by=ua.id,
            created_at=joined,
            last_activity_at=joined,
        )
        ctx.session.add(conv)
        await ctx.session.flush()
        for uid in {ua.id, ub.id}:
            ctx.session.add(ConversationMember(conversation_id=conv.id, user_id=uid, joined_at=joined))
        ctx.convs[key] = conv

    for key, (title, description, admins, members) in GROUPS.items():
        created = ctx.ago(SCRIPTS[key][0] + GROUP_CREATED_BEFORE_FIRST_LINE)
        creator = ctx.users[admins[0]]
        conv = Conversation(
            kind="group", title=title, description=description, created_by=creator.id,
            created_at=created, last_activity_at=created,
        )
        ctx.session.add(conv)
        await ctx.session.flush()
        for ukey in admins + members:
            role = "admin" if ukey in admins else "member"
            ctx.session.add(
                ConversationMember(conversation_id=conv.id, user_id=ctx.users[ukey].id, role=role, joined_at=created)
            )
        ctx.convs[key] = conv
        minutes = SCRIPTS[key][0] + GROUP_CREATED_BEFORE_FIRST_LINE
        await ctx.add_message(key, None, None, minutes, system_event={"type": "group_created", "actor_id": creator.id})
        added = [ctx.users[u].id for u in admins[1:] + members]
        await ctx.add_message(
            key, None, None, minutes, system_event={"type": "member_added", "actor_id": creator.id, "user_ids": added}
        )


async def _attach(ctx: SeedContext, message, media: dict) -> None:
    uploader = message.sender_id
    for position, name in enumerate(media.get("images", [])):
        data = landscape(name)
        ctx.session.add(
            Attachment(
                message_id=message.id, uploader_id=uploader, kind="image", mime_type="image/jpeg",
                size_bytes=len(data), original_name=f"{name}.jpg", storage_key=store(ctx.settings.upload_dir, data, ".jpg"),
                width=960, height=720, position=position, created_at=message.created_at,
            )
        )
    if "file" in media:
        data = pdf_document(media["file"].removesuffix(".pdf"))
        ctx.session.add(
            Attachment(
                message_id=message.id, uploader_id=uploader, kind="file", mime_type="application/pdf",
                size_bytes=len(data), original_name=media["file"], storage_key=store(ctx.settings.upload_dir, data, ".pdf"),
                position=0, created_at=message.created_at,
            )
        )


async def _messages(ctx: SeedContext) -> None:
    for key, (start, lines) in SCRIPTS.items():
        minutes_ago = start
        for sender, gap, text, *rest in lines:
            minutes_ago -= gap
            extras = rest[0] if rest else {}
            has_media = "images" in extras or "file" in extras
            reply_to = ctx.message_ids[key][-extras["reply"]] if "reply" in extras else None
            message = await ctx.add_message(
                key, sender, text, minutes_ago, kind="media" if has_media else "text", reply_to_id=reply_to
            )
            if has_media:
                await _attach(ctx, message, extras)
            for user_key, emoji in extras.get("reactions", {}).items():
                ctx.session.add(
                    Reaction(message_id=message.id, user_id=ctx.users[user_key].id, emoji=emoji, created_at=message.created_at)
                )


async def _receipts(ctx: SeedContext) -> None:
    """Everyone has read everything, except a few deliberate gaps for Alice's demo."""
    for key, conv in ctx.convs.items():
        last = ctx.message_ids.get(key, [0])[-1]
        members = await ctx.session.scalars(
            select(ConversationMember).where(ConversationMember.conversation_id == conv.id)
        )
        for m in members:
            m.last_delivered_message_id = last
            m.last_read_message_id = last
    ids = ctx.message_ids
    await ctx.set_cursors("alice_daniel", "alice", ids["alice_daniel"][-1], ids["alice_daniel"][-4])  # 3 unread
    await ctx.set_cursors("phoenix", "alice", ids["phoenix"][-1], ids["phoenix"][-5])  # 4 unread
    await ctx.set_cursors("alice_bob", "bob", ids["alice_bob"][-1], ids["alice_bob"][-2])  # Alice's last: delivered
    await ctx.set_cursors("alice_emma", "emma", ids["alice_emma"][-2], ids["alice_emma"][-2])  # Alice's last: sent


async def seed_core(ctx: SeedContext) -> None:
    await _users(ctx)
    await _conversations(ctx)
    await _messages(ctx)
    await _receipts(ctx)


FEATURE_SEEDERS: list[Callable[[SeedContext], Awaitable[None]]] = [seed_core]
