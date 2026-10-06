import uuid

from tests.helpers import assert_no_event, befriend, login, ws_session


def _setup(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]
    return a, b, conv


def _send(client, s, conv, body="hello"):
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _items(client, s, conv):
    return client.get(f"/api/conversations/{conv}/messages", headers=s.headers).json()["items"]


def _until(ws, type_, limit=8):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(type_)


def test_edit_by_sender_creates_revision(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv, "helo")
    with ws_session(client, b.token) as bob_ws:
        r = client.patch(f"/api/messages/{msg['id']}", json={"body": "hello"}, headers=a.headers)
        assert r.status_code == 200, r.text
        assert r.json()["body"] == "hello" and r.json()["edited_at"] is not None
        frame = _until(bob_ws, "message.updated")
        assert frame["data"]["id"] == msg["id"] and frame["data"]["body"] == "hello"
    revisions = client.get(f"/api/messages/{msg['id']}/revisions", headers=b.headers).json()
    assert [r["body"] for r in revisions] == ["helo"]


def test_edit_by_other_403(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    r = client.patch(f"/api/messages/{msg['id']}", json={"body": "hacked"}, headers=b.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_sender"


def test_edit_after_window_403(client, clock):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    clock.advance(hours=24, seconds=1)
    r = client.patch(f"/api/messages/{msg['id']}", json={"body": "late"}, headers=a.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "edit_window_passed"


def test_edit_rejects_empty_body(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    assert client.patch(f"/api/messages/{msg['id']}", json={"body": "   "}, headers=a.headers).status_code == 422


def test_delete_for_everyone_tombstone(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    client.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "👍"}, headers=b.headers)
    with ws_session(client, b.token) as bob_ws:
        r = client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=a.headers)
        assert r.status_code == 204, r.text
        frame = _until(bob_ws, "message.updated")
        assert frame["data"]["id"] == msg["id"] and frame["data"]["deleted_at"] is not None
    item = _items(client, b, conv)[0]
    assert item["body"] is None and item["deleted_at"] is not None and item["reactions"] == []


def test_delete_for_everyone_only_sender_and_in_window(client, clock):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    r = client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=b.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_sender"
    clock.advance(hours=24, seconds=1)
    r = client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=a.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "delete_window_passed"


def test_delete_for_me_hides_only_for_me(client):
    a, b, conv = _setup(client)
    keep = _send(client, a, conv, "keep")
    gone = _send(client, b, conv, "gone")
    assert client.delete(f"/api/messages/{gone['id']}?scope=me", headers=a.headers).status_code == 204
    assert [m["id"] for m in _items(client, a, conv)] == [keep["id"]]
    assert {m["id"] for m in _items(client, b, conv)} == {keep["id"], gone["id"]}
    preview = next(c for c in client.get("/api/conversations", headers=a.headers).json() if c["id"] == conv)
    assert preview["last_message"]["id"] == keep["id"]


def test_hidden_excluded_from_unread(client):
    a, b, conv = _setup(client)
    m1 = _send(client, b, conv, "one")
    _send(client, b, conv, "two")
    client.delete(f"/api/messages/{m1['id']}?scope=me", headers=a.headers)
    preview = next(c for c in client.get("/api/conversations", headers=a.headers).json() if c["id"] == conv)
    assert preview["unread_count"] == 1


def test_hidden_excluded_from_search(client):
    a, b, conv = _setup(client)
    m = _send(client, b, conv, "pineapple")
    client.delete(f"/api/messages/{m['id']}?scope=me", headers=a.headers)
    assert client.get("/api/search?q=pineapple", headers=a.headers).json()["messages"] == []


def test_cannot_edit_deleted(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv)
    client.delete(f"/api/messages/{msg['id']}?scope=everyone", headers=a.headers)
    r = client.patch(f"/api/messages/{msg['id']}", json={"body": "again"}, headers=a.headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "message_deleted"


def test_edit_not_pushed_to_someone_who_deleted_it_for_themselves(client):
    a, b, conv = _setup(client)
    msg = _send(client, a, conv, "typo")
    client.delete(f"/api/messages/{msg['id']}?scope=me", headers=b.headers)
    with ws_session(client, b.token) as bob_ws:
        client.patch(f"/api/messages/{msg['id']}", json={"body": "fixed"}, headers=a.headers)
        assert_no_event(bob_ws)
