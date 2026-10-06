"""Dispatch for client -> server WebSocket frames (after authentication)."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import WebSocket

from app.context import Ctx
from app.realtime import events


@dataclass(frozen=True)
class Connection:
    user_id: int
    device_id: int
    ws: WebSocket
    ctx: Ctx


Handler = Callable[[Connection, dict], Awaitable[None]]


async def _ping(conn: Connection, _data: dict) -> None:
    await conn.ws.send_json(events.pong())


HANDLERS: dict[str, Handler] = {"ping": _ping}


async def handle_frame(conn: Connection, frame: dict) -> None:
    handler = HANDLERS.get(frame.get("type", ""))
    if handler is not None:  # unknown frame types are ignored
        data = frame.get("data")
        await handler(conn, data if isinstance(data, dict) else {})
