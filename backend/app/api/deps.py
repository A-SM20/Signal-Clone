from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx, get_ctx
from app.db import get_session
from app.errors import AppError
from app.models import Device, User
from app.services.auth import hash_token

TOUCH_INTERVAL = timedelta(minutes=1)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
CtxDep = Annotated[Ctx, Depends(get_ctx)]


async def current_device(
    session: SessionDep,
    ctx: CtxDep,
    authorization: Annotated[str | None, Header()] = None,
) -> Device:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError(401, "unauthorized", "Sign in required")
    token = authorization.split(" ", 1)[1].strip()
    device = await session.scalar(select(Device).where(Device.token_hash == hash_token(token)))
    if device is None or device.revoked_at is not None:
        raise AppError(401, "unauthorized", "Your session has ended. Please sign in again.")
    now = ctx.clock.now()
    if now - device.last_active_at >= TOUCH_INTERVAL:
        device.last_active_at = now
        await session.commit()
    return device


DeviceDep = Annotated[Device, Depends(current_device)]


async def current_user(session: SessionDep, device: DeviceDep) -> User:
    return await session.get_one(User, device.user_id)


UserDep = Annotated[User, Depends(current_user)]
