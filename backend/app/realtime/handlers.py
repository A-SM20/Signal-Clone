"""Dispatch for client -> server WebSocket frames (after authentication)."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import WebSocket

from app.context import Ctx
from app.models import User
from app.realtime import events
from app.services import receipts


@dataclass(frozen=True)
class Connection:
    user_id: int
    device_id: int
    ws: WebSocket
    ctx: Ctx


Handler = Callable[[Connection, dict], Awaitable[None]]


async def _ping(conn: Connection, _data: dict) -> None:
    await conn.ws.send_json(events.pong())


async def _receipt(conn: Connection, data: dict) -> None:
    conversation_id, up_to, kind = data.get("conversation_id"), data.get("up_to_message_id"), data.get("kind")
    if not (isinstance(conversation_id, int) and isinstance(up_to, int) and kind in ("delivered", "read")):
        return
    async with conn.ws.app.state.session_factory() as session:
        user = await session.get_one(User, conn.user_id)
        await receipts.advance_cursor(session, conn.ctx, user, conversation_id, kind, up_to)


async def _typing(conn: Connection, data: dict) -> None:
    conversation_id, state = data.get("conversation_id"), data.get("state")
    if not (isinstance(conversation_id, int) and state in ("start", "stop")):
        return
    async with conn.ws.app.state.session_factory() as session:
        await receipts.relay_typing(session, conn.ctx, conn.user_id, conversation_id, state)


HANDLERS: dict[str, Handler] = {"ping": _ping, "receipt": _receipt, "typing": _typing}


async def handle_frame(conn: Connection, frame: dict) -> None:
    handler = HANDLERS.get(frame.get("type", ""))
    if handler is not None:  # unknown frame types are ignored
        data = frame.get("data")
        await handler(conn, data if isinstance(data, dict) else {})
