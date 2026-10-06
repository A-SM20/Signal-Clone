import base64
import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import AVATAR_COLORS
from app.context import Ctx
from app.errors import AppError
from app.models import Device, User, UserSettings
from app.services.phone import normalize_phone


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_identity_key() -> str:
    """Mock identity public key (32 random bytes). Real Signal derives this from a Curve25519 key pair."""
    return base64.b64encode(secrets.token_bytes(32)).decode()


async def find_user_by_phone(session: AsyncSession, phone: str) -> User | None:
    return await session.scalar(select(User).where(User.phone == phone))


async def is_new_user(session: AsyncSession, raw_phone: str) -> bool:
    return await find_user_by_phone(session, normalize_phone(raw_phone)) is None


async def create_user(session: AsyncSession, ctx: Ctx, phone: str, display_name: str = "") -> User:
    user = User(
        phone=phone,
        display_name=display_name,
        avatar_color=AVATAR_COLORS[0],
        identity_key=new_identity_key(),
        created_at=ctx.clock.now(),
    )
    session.add(user)
    await session.flush()
    user.avatar_color = AVATAR_COLORS[user.id % len(AVATAR_COLORS)]
    session.add(UserSettings(user_id=user.id))
    await session.flush()
    return user


async def create_device(session: AsyncSession, ctx: Ctx, user: User, name: str) -> tuple[str, Device]:
    """Creates a device session and returns the raw token — the only time it exists in plaintext."""
    has_device = await session.scalar(select(Device.id).where(Device.user_id == user.id).limit(1))
    token = new_token()
    now = ctx.clock.now()
    device = Device(
        user_id=user.id,
        name=name,
        token_hash=hash_token(token),
        is_primary=has_device is None,
        created_at=now,
        last_active_at=now,
    )
    session.add(device)
    await session.flush()
    return token, device


async def verify_otp(
    session: AsyncSession, ctx: Ctx, phone: str, code: str, device_name: str
) -> tuple[str, User, bool]:
    """Mocked verification: any number + the fixed OTP. Returns (raw token, user, is_new_user)."""
    normalized = normalize_phone(phone)
    if not hmac.compare_digest(code.strip(), ctx.settings.mock_otp):
        raise AppError(400, "invalid_otp", "That code is incorrect")
    user = await find_user_by_phone(session, normalized)
    created = user is None
    if created:
        user = await create_user(session, ctx, normalized)
    token, _ = await create_device(session, ctx, user, device_name)
    await session.commit()
    return token, user, created
