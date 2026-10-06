import time

import pytest
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.models import Contact, User
from tests.helpers import assert_no_event, db_call, login, ws_session


def _add_contact(client, owner_id, contact_id):
    async def run(s):
        s.add(Contact(owner_id=owner_id, contact_id=contact_id))

    db_call(client, run)


def test_ws_auth_ready(client):
    a = login(client, "+15550100001", "Alice")
    with ws_session(client, a.token) as ws:
        assert_no_event(ws)


def test_ws_ready_payload(client):
    a = login(client, "+15550100001", "Alice")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": a.token})
        frame = ws.receive_json()
        assert frame["type"] == "ready" and frame["data"]["user_id"] == a.user_id


def test_ws_bad_token_closes_4401(client):
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": "nope"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4401


def test_ws_revoked_device_closes_4403(client):
    a = login(client, "+15550100001", "Alice")
    client.post("/api/auth/logout", headers=a.headers)
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": a.token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4403


def test_ws_auth_timeout_4401(client_fast_timeouts):
    with client_fast_timeouts.websocket_connect("/api/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4401


def test_idle_socket_dropped(client_fast_timeouts):
    c = client_fast_timeouts
    a = login(c, "+15550100001", "Alice")
    with ws_session(c, a.token) as ws:
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    # The server unregisters just after closing the socket; give it a moment on slow CI runners.
    deadline = time.monotonic() + 2
    while c.app.state.hub.is_online(a.user_id) and time.monotonic() < deadline:
        time.sleep(0.02)
    assert c.app.state.hub.is_online(a.user_id) is False


def test_ping_pong(client):
    a = login(client, "+15550100001", "Alice")
    with ws_session(client, a.token) as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"


def test_presence_broadcast_to_contacts(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    _add_contact(client, b.user_id, a.user_id)
    with ws_session(client, b.token) as bob_ws:
        with ws_session(client, a.token):
            frame = bob_ws.receive_json()
            assert frame["type"] == "presence"
            assert frame["data"] == {"user_id": a.user_id, "online": True, "last_seen_at": None} or (
                frame["data"]["user_id"] == a.user_id and frame["data"]["online"] is True
            )


def test_presence_not_sent_to_strangers(client):
    a = login(client, "+15550100001", "Alice")
    c = login(client, "+15550100003", "Carol")
    with ws_session(client, c.token) as carol_ws:
        with ws_session(client, a.token):
            assert_no_event(carol_ws)


def test_last_seen_set_on_disconnect(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    _add_contact(client, b.user_id, a.user_id)
    with ws_session(client, b.token) as bob_ws:
        with ws_session(client, a.token):
            assert bob_ws.receive_json()["data"]["online"] is True
        offline = bob_ws.receive_json()
        assert offline["type"] == "presence" and offline["data"]["online"] is False

    async def last_seen(s):
        return (await s.scalar(select(User).where(User.id == a.user_id))).last_seen_at

    assert db_call(client, last_seen) == clock.now()


def test_share_last_seen_false_hides_presence(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    _add_contact(client, b.user_id, a.user_id)
    client.patch("/api/me/settings", json={"share_last_seen": False}, headers=a.headers)
    with ws_session(client, b.token) as bob_ws:
        with ws_session(client, a.token):
            frame = bob_ws.receive_json()
            assert frame["data"]["online"] is False and frame["data"]["last_seen_at"] is None


def test_logout_closes_open_sockets_of_that_device(client):
    a = login(client, "+15550100001", "Alice")
    with ws_session(client, a.token) as ws:
        client.post("/api/auth/logout", headers=a.headers)
        with pytest.raises(WebSocketDisconnect) as exc:
            while True:  # skip anything queued before the close (e.g. presence)
                ws.receive_json()
    assert exc.value.code == 4403
