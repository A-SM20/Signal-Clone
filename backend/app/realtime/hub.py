import logging
from collections.abc import Iterable
from typing import Any, Protocol

log = logging.getLogger(__name__)


class Socket(Protocol):
    async def send_json(self, data: Any) -> None: ...
    async def close(self, code: int = 1000) -> None: ...


class Hub:
    """In-memory registry of live sockets: user_id -> {device_id -> socket}.

    Lives in a single process (one uvicorn worker). Scaling out would replace
    this with a pub/sub fan-out (e.g. Redis) — documented in the README.

    register/unregister never await, so each runs atomically on the event loop
    (no lock needed) and cannot be interrupted by task cancellation.
    """

    def __init__(self) -> None:
        self._sockets: dict[int, dict[int, Socket]] = {}
        self._device_owner: dict[int, int] = {}

    async def register(self, user_id: int, device_id: int, ws: Socket) -> bool:
        """Returns True if this is the user's first live device (they just came online)."""
        devices = self._sockets.setdefault(user_id, {})
        came_online = not devices
        devices[device_id] = ws
        self._device_owner[device_id] = user_id
        return came_online

    async def unregister(self, user_id: int, device_id: int) -> bool:
        """Returns True if the user has no live devices left (they just went offline)."""
        return self._remove(user_id, device_id)

    def _remove(self, user_id: int, device_id: int) -> bool:
        devices = self._sockets.get(user_id)
        if not devices or device_id not in devices:
            return False
        del devices[device_id]
        self._device_owner.pop(device_id, None)
        if not devices:
            del self._sockets[user_id]
            return True
        return False

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    async def send_to_users(self, user_ids: Iterable[int], event: dict) -> None:
        targets = [
            (uid, did, ws)
            for uid in set(user_ids)
            for did, ws in list(self._sockets.get(uid, {}).items())
        ]
        for uid, did, ws in targets:
            await self._send(uid, did, ws, event)

    async def send_to_device(self, device_id: int, event: dict) -> None:
        uid = self._device_owner.get(device_id)
        ws = self._sockets.get(uid, {}).get(device_id) if uid is not None else None
        if ws is not None:
            await self._send(uid, device_id, ws, event)

    async def close_device(self, device_id: int, code: int) -> None:
        uid = self._device_owner.get(device_id)
        ws = self._sockets.get(uid, {}).get(device_id) if uid is not None else None
        if ws is None:
            return
        # The socket's own receive loop sees the close and calls unregister(),
        # so presence transitions are reported exactly once.
        try:
            await ws.close(code=code)
        except Exception:  # already closed
            pass

    async def _send(self, user_id: int, device_id: int, ws: Socket, event: dict) -> None:
        try:
            await ws.send_json(event)
        except Exception:
            log.info("dropping dead socket user=%s device=%s", user_id, device_id)
            self._remove(user_id, device_id)
