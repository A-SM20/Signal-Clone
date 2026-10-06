import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.context import Ctx
from app.models import Device
from app.realtime import events
from app.realtime.handlers import Connection, handle_frame
from app.services.auth import hash_token
from app.services.presence import broadcast_presence

log = logging.getLogger(__name__)
router = APIRouter()

CLOSE_UNAUTHORIZED = 4401
CLOSE_REVOKED = 4403


async def _receive_frame(ws: WebSocket, timeout: float) -> dict:
    """Next JSON object from the client; malformed frames are skipped."""
    while True:
        text = await asyncio.wait_for(ws.receive_text(), timeout=timeout)
        try:
            frame = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(frame, dict):
            return frame


async def _authenticate(ws: WebSocket, ctx: Ctx) -> Device | None:
    try:
        frame = await _receive_frame(ws, ctx.settings.ws_auth_timeout_seconds)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return None
    token = frame.get("token") if frame.get("type") == "auth" else None
    device = await asyncio.shield(_find_device(ws.app.state, token)) if isinstance(token, str) else None
    if device is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return None
    if device.revoked_at is not None:
        await ws.close(code=CLOSE_REVOKED)
        return None
    return device


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    state = ws.app.state
    ctx = Ctx(settings=state.settings, clock=state.clock, hub=state.hub)
    await ws.accept()
    device = await _authenticate(ws, ctx)
    if device is None:
        return

    conn = Connection(user_id=device.user_id, device_id=device.id, ws=ws, ctx=ctx)
    came_online = await ctx.hub.register(conn.user_id, conn.device_id, ws)
    timed_out = False
    # Everything after register() sits inside try/finally: a client that vanishes at
    # any point (even mid-handshake) must be unregistered, or it stays "online".
    try:
        await ws.send_json(events.ready(conn.user_id, conn.device_id))
        if came_online:
            await asyncio.shield(_broadcast(state, ctx, conn.user_id, online=True))
        while True:
            frame = await _receive_frame(ws, ctx.settings.ws_idle_timeout_seconds)
            # Shielded: if the connection task is cancelled (client gone, shutdown),
            # in-flight DB work still completes instead of leaving a broken connection.
            await asyncio.shield(handle_frame(conn, frame))
    except asyncio.TimeoutError:
        timed_out = True  # silent client (no heartbeat) — drop it
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        went_offline = await ctx.hub.unregister(conn.user_id, conn.device_id)
        if timed_out:
            try:
                await ws.close(code=1001)
            except RuntimeError:
                pass
        if went_offline:
            # Runs detached: the connection task may be cancelled once the client is
            # gone, and a DB write interrupted mid-query would poison the connection.
            spawn(state, _broadcast(state, ctx, conn.user_id, online=False))


async def _find_device(state, token: str) -> Device | None:
    async with state.session_factory() as session:
        return await session.scalar(select(Device).where(Device.token_hash == hash_token(token)))


async def _broadcast(state, ctx: Ctx, user_id: int, online: bool) -> None:
    async with state.session_factory() as session:
        await broadcast_presence(session, ctx, user_id, online=online)


def spawn(state, coro) -> None:
    """Fire-and-forget task with a strong reference so it is not garbage-collected mid-flight."""
    task = asyncio.create_task(coro)
    state.background_tasks.add(task)
    task.add_done_callback(_finish_background)
    task.add_done_callback(state.background_tasks.discard)


def _finish_background(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        log.error("background task failed", exc_info=task.exception())
