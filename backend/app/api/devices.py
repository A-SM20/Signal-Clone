from typing import Annotated

from fastapi import APIRouter, Header, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CtxDep, DeviceDep, SessionDep
from app.errors import AppError
from app.models import Device
from app.realtime import events
from app.realtime.ws_router import CLOSE_REVOKED
from app.schemas.devices import DeviceOut
from app.services import linking
from app.services.linking import LinkPollOut, LinkRequestOut

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


class LinkRequestIn(BaseModel):
    device_name: str = Field(default="New device", min_length=1, max_length=80)


class ApproveIn(BaseModel):
    code: str = Field(min_length=1, max_length=16)


class ApproveOut(BaseModel):
    device_name: str


@router.post("/link-requests", response_model=LinkRequestOut, status_code=201)
async def create_link_request(body: LinkRequestIn, session: SessionDep, ctx: CtxDep) -> LinkRequestOut:
    """Called by the new, signed-out browser. The poll secret proves it is the one that asked."""
    return await linking.create_request(session, ctx, body.device_name)


@router.get("/link-requests/{request_id}", response_model=LinkPollOut, response_model_exclude_none=True)
async def poll_link_request(
    request_id: int,
    session: SessionDep,
    ctx: CtxDep,
    x_poll_secret: Annotated[str | None, Header()] = None,
) -> LinkPollOut:
    return await linking.poll(session, ctx, request_id, x_poll_secret)


@router.post("/link-requests/approve", response_model=ApproveOut)
async def approve_link_request(body: ApproveIn, session: SessionDep, ctx: CtxDep, current: DeviceDep) -> ApproveOut:
    return ApproveOut(device_name=await linking.approve(session, ctx, current, body.code))
