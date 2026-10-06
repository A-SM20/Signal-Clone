import uuid

from app.context import Ctx
from app.tasks.sweepers import sweep_expired_pins
from tests.helpers import befriend, login, ws_session


def _setup(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]
    return a, b, conv


def _send(client, s, conv, body="hello"):
    return client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    ).json()


def _pin(client, s, message_id, duration="forever"):
    return client.post(f"/api/messages/{message_id}/pin", json={"duration": duration}, headers=s.headers)


def _pins(client, s, conv):
    return client.get(f"/api/conversations/{conv}", headers=s.headers).json()["pins"]


def _until(ws, type_, limit=8):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(type_)


def test_pin_and_event(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    with ws_session(client, b.token) as bob_ws:
        r = _pin(client, a, msg["id"], "7d")
        assert r.status_code == 200, r.text
        frame = _until(bob_ws, "pin.updated")
        assert frame["data"]["conversation_id"] == conv
        assert [p["message_id"] for p in frame["data"]["pins"]] == [msg["id"]]
    pins = _pins(client, b, conv)
    assert pins[0]["pinned_by"] == a.user_id and pins[0]["expires_at"] is not None
    assert pins[0]["message"]["body"] == "hello"
    assert client.delete(f"/api/messages/{msg['id']}/pin", headers=b.headers).status_code == 200
    assert _pins(client, a, conv) == []


def test_fourth_pin_evicts_oldest(client, clock):
    a, b, conv = _setup(client)
    ids = [_send(client, a, conv, f"m{i}")["id"] for i in range(4)]
    for mid in ids:
        _pin(client, a, mid)
        clock.advance(seconds=1)
    assert sorted(p["message_id"] for p in _pins(client, a, conv)) == ids[1:]


def test_admins_only_permission(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    group = client.post("/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id]}, headers=a.headers).json()
    r = client.patch(f"/api/conversations/{group['id']}", json={"pin_permission": "admins"}, headers=a.headers)
    assert r.status_code == 200 and r.json()["pin_permission"] == "admins"
    msg = _send(client, b, group["id"])
    r = _pin(client, b, msg["id"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_admin"
    assert _pin(client, a, msg["id"]).status_code == 200


def test_pin_expiry_sweeper(client, clock):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    _pin(client, a, msg["id"], "24h")
    clock.advance(hours=25)
    state = client.app.state
    with ws_session(client, b.token) as bob_ws:
        ctx = Ctx(settings=state.settings, clock=state.clock, hub=state.hub)
        assert client.portal.call(sweep_expired_pins, state.session_factory, ctx) == 1
        assert _until(bob_ws, "pin.updated")["data"]["pins"] == []
    assert _pins(client, a, conv) == []


def test_cannot_pin_deleted(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=a.headers)
    r = _pin(client, a, msg["id"])
    assert r.status_code == 400 and r.json()["error"]["code"] == "message_deleted"


def test_delete_for_everyone_unpins(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    _pin(client, a, msg["id"])
    client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=a.headers)
    assert _pins(client, a, conv) == []


def _group_with_late_joiner(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    befriend(client, a, b, c)
    g = client.post("/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id]}, headers=a.headers).json()["id"]
    old = _send(client, a, g, "before carol")
    clock.advance(seconds=5)
    client.post(f"/api/conversations/{g}/members", json={"user_ids": [c.user_id]}, headers=a.headers)
    clock.advance(seconds=5)
    return a, b, c, g, old


def test_late_joiner_cannot_reach_messages_from_before_joining(client, clock):
    a, b, c, g, old = _group_with_late_joiner(client, clock)
    assert _pin(client, c, old["id"]).status_code == 404
    assert client.put(f"/api/messages/{old['id']}/reaction", json={"emoji": "👍"}, headers=c.headers).status_code == 404
    assert client.get(f"/api/messages/{old['id']}/revisions", headers=c.headers).status_code == 404
    r = client.post(
        f"/api/conversations/{g}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": "re", "reply_to_id": old["id"]},
        headers=c.headers,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_reply"


def test_pins_respect_each_viewers_window(client, clock):
    a, b, c, g, old = _group_with_late_joiner(client, clock)
    _pin(client, a, old["id"])
    assert _pins(client, c, g) == []  # Carol joined after the message was sent
    assert [p["message_id"] for p in _pins(client, b, g)] == [old["id"]]
    client.delete(f"/api/conversations/{g}/members/{b.user_id}", headers=a.headers)
    clock.advance(seconds=5)
    later = _send(client, a, g, "after bob left")
    _pin(client, a, later["id"])
    assert [p["message_id"] for p in _pins(client, b, g)] == [old["id"]]  # nothing from after Bob left
