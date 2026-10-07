from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.models import User, UserSettings
from app.schemas.users import MeOut, SettingsOut, UserOut


def avatar_url(ctx: Ctx, storage_key: str | None) -> str | None:
    if not storage_key:
        return None
    from app.services.files import sign_path  # local import: files depends on settings only

    return sign_path(ctx, storage_key)


def to_user_out(user: User, ctx: Ctx, settings: UserSettings | None) -> UserOut:
    """Public profile. Presence is hidden when the user turned off 'share last seen'."""
    share = settings.share_last_seen if settings is not None else True
    return UserOut(
        id=user.id,
        phone=user.phone,
        username=user.username,
        display_name=user.display_name,
        about=user.about,
        avatar_url=avatar_url(ctx, user.avatar_path),
        avatar_color=user.avatar_color,
        online=share and ctx.hub.is_online(user.id),
        last_seen_at=user.last_seen_at if share else None,
    )


def to_settings_out(settings: UserSettings) -> SettingsOut:
    return SettingsOut.model_validate(settings, from_attributes=True)


def to_me_out(user: User, ctx: Ctx, settings: UserSettings) -> MeOut:
    base = to_user_out(user, ctx, settings)
    # Your own presence is always visible to you.
    return MeOut(**base.model_dump() | {"online": True}, settings=to_settings_out(settings), has_pin=bool(user.pin))


async def get_settings(session: AsyncSession, user_id: int) -> UserSettings:
    return await session.get_one(UserSettings, user_id)


async def settings_for(session: AsyncSession, user_ids: set[int]) -> dict[int, UserSettings]:
    if not user_ids:
        return {}
    rows = await session.scalars(select(UserSettings).where(UserSettings.user_id.in_(user_ids)))
    return {s.user_id: s for s in rows}


async def users_out(session: AsyncSession, ctx: Ctx, users: list[User]) -> dict[int, UserOut]:
    prefs = await settings_for(session, {u.id for u in users})
    return {u.id: to_user_out(u, ctx, prefs.get(u.id)) for u in users}
