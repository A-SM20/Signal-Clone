from contextlib import contextmanager
from typing import Any, Awaitable, Callable, NamedTuple

from sqlalchemy.ext.asyncio import AsyncSession

OTP = "123456"


class Session(NamedTuple):
    token: str
    user_id: int
    headers: dict


def db_call(client, fn: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
    """Run `async fn(session)` on the app's event loop and commit."""

    async def runner():
        async with client.app.state.session_factory() as session:
            result = await fn(session)
            await session.commit()
            return result

    return client.portal.call(runner)


def login(client, phone: str, name: str | None = None) -> Session:
    """Log in via the mocked OTP flow; completes the profile when the user is new."""
    r = client.post("/api/auth/verify-otp", json={"phone": phone, "code": OTP, "device_name": "pytest"})
    assert r.status_code == 200, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    if body["is_new_user"]:
        p = client.patch("/api/me", json={"display_name": name or "Test User"}, headers=headers)
        assert p.status_code == 200, p.text
    return Session(body["token"], body["user"]["id"], headers)


@contextmanager
def ws_session(client, token: str):
    """Connected + authenticated socket; asserts the server's `ready` frame."""
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        frame = ws.receive_json()
        assert frame["type"] == "ready", frame
        yield ws


def assert_no_event(ws) -> None:
    """Proves nothing was queued: the very next frame after a ping must be the pong."""
    ws.send_json({"type": "ping"})
    frame = ws.receive_json()
    assert frame["type"] == "pong", f"unexpected event: {frame}"


def befriend(client, *sessions: Session) -> None:
    """Make every pair mutual contacts, so chats between them aren't message requests."""
    phones = {s.user_id: client.get("/api/me", headers=s.headers).json()["phone"] for s in sessions}
    for owner in sessions:
        for other in sessions:
            if owner.user_id != other.user_id:
                client.post("/api/contacts", json={"phone": phones[other.user_id]}, headers=owner.headers)
