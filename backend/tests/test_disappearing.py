import uuid
from datetime import datetime, timedelta

from app.context import Ctx
from app.tasks.sweepers import sweep_expired
from tests.helpers import login, ws_session


def _direct(client, a, b):
    return client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]


def _send(client, s, conv, body="poof"):
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _set_timer(client, s, conv, seconds):
    return client.patch(f"/api/conversations/{conv}", json={"disappearing_seconds": seconds}, headers=s.headers)


def _sweep(client):
    state = client.app.state
    ctx = Ctx(settings=state.settings, clock=state.clock, hub=state.hub)
    return client.portal.call(sweep_expired, state.session_factory, ctx)


def _until(ws, type_, limit=6):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(type_)


def test_expires_at_set_on_send(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert _set_timer(client, a, conv, 30).status_code == 200
    msg = _send(client, a, conv)
    assert datetime.fromisoformat(msg["expires_at"]) == clock.now() + timedelta(seconds=30)


def test_sweeper_removes_and_notifies(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    _set_timer(client, a, conv, 30)
    msg = _send(client, a, conv)
    clock.advance(seconds=29)
    assert _sweep(client) == 0
    with ws_session(client, b.token) as bob_ws:
        clock.advance(seconds=2)
        assert _sweep(client) == 1
        frame = _until(bob_ws, "message.removed")
        assert frame["data"] == {"conversation_id": conv, "message_ids": [msg["id"]]}
    ids = [m["id"] for m in client.get(f"/api/conversations/{conv}/messages", headers=a.headers).json()["items"]]
    assert msg["id"] not in ids


def test_invalid_timer_value_422(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert _set_timer(client, a, conv, 45).status_code == 422


def test_any_member_can_set_timer_in_direct_chat(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    r = _set_timer(client, b, conv, 3600)
    assert r.status_code == 200 and r.json()["disappearing_seconds"] == 3600


def test_group_timer_admin_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = client.post("/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id]}, headers=a.headers).json()["id"]
    r = _set_timer(client, b, g, 3600)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_admin"
    assert _set_timer(client, a, g, 3600).status_code == 200


def test_timer_change_posts_system_message(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    _set_timer(client, a, conv, 86400)
    last = client.get(f"/api/conversations/{conv}", headers=b.headers).json()["last_message"]
    assert last["kind"] == "system" and last["system_event"] == {"type": "timer_changed", "actor_id": a.user_id, "seconds": 86400}


def test_new_direct_chat_uses_creators_default_timer(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.patch("/api/me/settings", json={"default_disappearing_seconds": 604800}, headers=a.headers)
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()
    assert conv["disappearing_seconds"] == 604800
