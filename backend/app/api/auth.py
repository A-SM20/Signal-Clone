from fastapi import APIRouter, Response

from app.api.deps import CtxDep, DeviceDep, SessionDep
from app.schemas.auth import AuthOut, OtpRequestIn, OtpRequestOut, VerifyOtpIn
from app.services import auth as auth_service
from app.services.users import get_settings, to_me_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp", response_model=OtpRequestOut)
async def request_otp(body: OtpRequestIn, session: SessionDep) -> OtpRequestOut:
    # Mocked: no SMS is sent; the code is always the configured MOCK_OTP.
    return OtpRequestOut(is_new_user=await auth_service.is_new_user(session, body.phone))


@router.post("/verify-otp", response_model=AuthOut)
async def verify_otp(body: VerifyOtpIn, session: SessionDep, ctx: CtxDep) -> AuthOut:
    token, user, is_new = await auth_service.verify_otp(session, ctx, body.phone, body.code, body.device_name)
    settings = await get_settings(session, user.id)
    return AuthOut(token=token, user=to_me_out(user, ctx, settings), is_new_user=is_new)


@router.post("/logout", status_code=204)
async def logout(session: SessionDep, ctx: CtxDep, device: DeviceDep) -> Response:
    device.revoked_at = ctx.clock.now()
    await session.commit()
    return Response(status_code=204)
