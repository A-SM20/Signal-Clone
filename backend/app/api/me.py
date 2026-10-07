from fastapi import APIRouter, UploadFile
from sqlalchemy import select

from app.api.deps import CtxDep, SessionDep, UserDep
from app.errors import AppError
from app.models import User
from app.schemas.users import MeOut, MePatch, SettingsOut, SettingsPatch
from app.services.files import delete_file, save_avatar
from app.services.users import get_settings, to_me_out, to_settings_out

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeOut)
async def get_me(user: UserDep, session: SessionDep, ctx: CtxDep) -> MeOut:
    return to_me_out(user, ctx, await get_settings(session, user.id))


@router.patch("", response_model=MeOut)
async def patch_me(body: MePatch, user: UserDep, session: SessionDep, ctx: CtxDep) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if "username" in changes and changes["username"] is not None:
        taken = await session.scalar(
            select(User.id).where(User.username == changes["username"], User.id != user.id)
        )
        if taken is not None:
            raise AppError(409, "username_taken", "That username is taken")
    for field, value in changes.items():
        if field == "display_name" and value is None:
            continue
        setattr(user, field, value)
    await session.commit()
    return to_me_out(user, ctx, await get_settings(session, user.id))


@router.post("/avatar", response_model=MeOut)
async def upload_avatar(file: UploadFile, user: UserDep, session: SessionDep, ctx: CtxDep) -> MeOut:
    old = user.avatar_path
    user.avatar_path = await save_avatar(session, file)
    await delete_file(session, old)
    await session.commit()
    return to_me_out(user, ctx, await get_settings(session, user.id))


@router.get("/settings", response_model=SettingsOut)
async def get_my_settings(user: UserDep, session: SessionDep) -> SettingsOut:
    return to_settings_out(await get_settings(session, user.id))


@router.patch("/settings", response_model=SettingsOut)
async def patch_my_settings(body: SettingsPatch, user: UserDep, session: SessionDep) -> SettingsOut:
    settings = await get_settings(session, user.id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(settings, field, value)
    await session.commit()
    return to_settings_out(settings)
