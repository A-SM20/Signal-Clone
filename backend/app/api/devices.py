from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import CtxDep, DeviceDep, SessionDep
from app.errors import AppError
from app.models import Device
from app.realtime import events
from app.realtime.ws_router import CLOSE_REVOKED
from app.schemas.devices import DeviceOut

router = APIRouter(tags=["devices"])


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(session: SessionDep, current: DeviceDep) -> list[DeviceOut]:
    rows = await session.scalars(
        select(Device)
        .where(Device.user_id == current.user_id, Device.revoked_at.is_(None))
        .order_by(Device.created_at)
    )
    return [
        DeviceOut(
            id=d.id,
            name=d.name,
            is_primary=d.is_primary,
            is_current=d.id == current.id,
            created_at=d.created_at,
            last_active_at=d.last_active_at,
        )
        for d in rows
    ]


@router.delete("/devices/{device_id}", status_code=204)
async def unlink_device(device_id: int, session: SessionDep, ctx: CtxDep, current: DeviceDep) -> Response:
    device = await session.get(Device, device_id)
    if device is None or device.user_id != current.user_id or device.revoked_at is not None:
        raise AppError(404, "not_found", "Device not found")
    device.revoked_at = ctx.clock.now()
    await session.commit()
    await ctx.hub.send_to_device(device_id, events.device_revoked())
    await ctx.hub.close_device(device_id, CLOSE_REVOKED)
    return Response(status_code=204)
