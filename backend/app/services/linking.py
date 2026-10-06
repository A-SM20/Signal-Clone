"""Device linking: the new browser shows a code/QR, a signed-in device approves it, the new browser
polls and receives its own session token exactly once (tokens are never stored in plaintext)."""

import hmac
import secrets

from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import LINK_CODE_TTL
from app.context import Ctx
from app.errors import AppError
from app.models import Device, LinkRequest, User
from app.schemas.users import MeOut
from app.services.auth import create_device, hash_token, new_token
from app.services.users import get_settings, to_me_out

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read aloud
CODE_LENGTH = 8


class LinkRequestOut(BaseModel):
    id: int
    code: str
    poll_secret: str
    expires_at: str


class LinkPollOut(BaseModel):
    status: str
    token: str | None = None
    user: MeOut | None = None


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


async def create_request(session: AsyncSession, ctx: Ctx, device_name: str) -> LinkRequestOut:
    secret = new_token()
    now = ctx.clock.now()
    for _ in range(5):  # a code collision is astronomically rare; retry rather than fail
        request = LinkRequest(
            code=new_code(),
            poll_secret_hash=hash_token(secret),
            requested_device_name=device_name,
            expires_at=now + LINK_CODE_TTL,
            created_at=now,
        )
        session.add(request)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            continue
        return LinkRequestOut(id=request.id, code=request.code, poll_secret=secret, expires_at=request.expires_at.isoformat())
    raise AppError(503, "try_again", "Couldn't create a link code, try again")


def _expire_if_due(request: LinkRequest, ctx: Ctx) -> None:
    if request.status == "pending" and ctx.clock.now() >= request.expires_at:
        request.status = "expired"


async def poll(session: AsyncSession, ctx: Ctx, request_id: int, secret: str | None) -> LinkPollOut:
    request = await session.get(LinkRequest, request_id)
    if request is None or not secret or not hmac.compare_digest(request.poll_secret_hash, hash_token(secret)):
        raise AppError(403, "bad_secret", "This link request isn't yours")
    _expire_if_due(request, ctx)
    if request.status != "approved" or request.issued_device_id is not None:
        await session.commit()
        return LinkPollOut(status=request.status)
    approver = await session.get(Device, request.approved_by_device_id) if request.approved_by_device_id else None
    if approver is None or approver.revoked_at is not None:
        request.status = "expired"
        await session.commit()
        return LinkPollOut(status="expired")
    user = await session.get_one(User, approver.user_id)
    token, device = await create_device(session, ctx, user, request.requested_device_name)
    # Hand the token over exactly once, even if two polls race.
    claimed = await session.execute(
        update(LinkRequest)
        .where(LinkRequest.id == request.id, LinkRequest.issued_device_id.is_(None))
        .values(issued_device_id=device.id)
    )
    if claimed.rowcount != 1:
        await session.rollback()
        return LinkPollOut(status="approved")
    await session.commit()
    return LinkPollOut(status="approved", token=token, user=to_me_out(user, ctx, await get_settings(session, user.id)))


async def approve(session: AsyncSession, ctx: Ctx, approver: Device, code: str) -> str:
    request = await session.scalar(select(LinkRequest).where(LinkRequest.code == code.strip().upper()))
    if request is not None:
        _expire_if_due(request, ctx)
    if request is None or request.status != "pending":
        await session.commit()
        raise AppError(404, "invalid_code", "That code is invalid or has expired")
    request.status = "approved"
    request.approved_by_device_id = approver.id
    await session.commit()
    return request.requested_device_name
