import uuid

from tests.helpers import assert_no_event, login, ws_session


def _direct(client, a, b):
    return client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]


def _send(client, s, conv_id, body="hello", client_id=None, **extra):
    payload = {"client_id": client_id or str(uuid.uuid4()), "kind": "text", "body": body, **extra}
    return client.post(f"/api/conversations/{conv_id}/messages", json=payload, headers=s.headers)


def _until(ws, type_, limit=6):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(f"no {type_}")


def test_send_and_receive_realtime(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    with ws_session(client, b.token) as bob_ws, ws_session(client, a.token) as alice_ws:
        r = _send(client, a, conv, "hi bob")
        assert r.status_code == 201
        got = _until(bob_ws, "message.created")
        assert got["data"]["body"] == "hi bob" and got["data"]["sender_id"] == a.user_id
        echo = _until(alice_ws, "message.created")  # sender's own devices get it too
        assert echo["data"]["client_id"] == r.json()["client_id"]


def test_send_is_idempotent(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    cid = str(uuid.uuid4())
    first = _send(client, a, conv, "once", client_id=cid)
    second = _send(client, a, conv, "once", client_id=cid)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    items = client.get(f"/api/conversations/{conv}/messages", headers=a.headers).json()["items"]
    assert len([m for m in items if m["client_id"] == cid]) == 1


def test_body_validation(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert _send(client, a, conv, "   ").status_code == 422
    assert _send(client, a, conv, "x" * 4097).status_code == 422
    assert _send(client, a, conv, "x" * 4096).status_code == 201
    stripped = _send(client, a, conv, "  padded  ")
    assert stripped.json()["body"] == "padded"


def test_reply_to_must_be_same_conversation(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    conv_ab = _direct(client, a, b)
    conv_ac = _direct(client, a, c)
    other = _send(client, a, conv_ac, "elsewhere").json()
    r = _send(client, a, conv_ab, "reply", reply_to_id=other["id"])
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_reply"


def test_reply_preview_included(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    original = _send(client, a, conv, "original").json()
    reply = _send(client, b, conv, "answer", reply_to_id=original["id"]).json()
    assert reply["reply_to"] == {
        "id": original["id"], "sender_id": a.user_id, "kind": "text", "body": "original", "deleted": False,
    }


def test_pagination_before_cursor(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    for i in range(120):
        assert _send(client, a, conv, f"m{i}").status_code == 201
    page1 = client.get(f"/api/conversations/{conv}/messages", params={"limit": 50}, headers=a.headers).json()
    assert len(page1["items"]) == 50 and page1["has_more"] is True
    assert page1["items"][0]["body"] == "m119"
    before = page1["items"][-1]["id"]
    page2 = client.get(
        f"/api/conversations/{conv}/messages", params={"limit": 50, "before": before}, headers=a.headers
    ).json()
    assert page2["items"][0]["body"] == "m69"
    assert not {m["id"] for m in page1["items"]} & {m["id"] for m in page2["items"]}
    page3 = client.get(
        f"/api/conversations/{conv}/messages", params={"limit": 50, "before": page2["items"][-1]["id"]}, headers=a.headers
    ).json()
    assert len(page3["items"]) == 20 and page3["has_more"] is False


def test_limit_bounds(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert client.get(f"/api/conversations/{conv}/messages", params={"limit": 101}, headers=a.headers).status_code == 422


def test_last_message_and_activity_updated(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    clock.advance(minutes=5)
    sent = _send(client, a, conv, "latest").json()
    view = client.get(f"/api/conversations/{conv}", headers=b.headers).json()
    assert view["last_message"]["id"] == sent["id"]
    assert view["last_activity_at"] == sent["created_at"]
    assert view["unread_count"] == 1


def test_removed_member_gets_no_events_and_cannot_send(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = client.post(
        "/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id, c.user_id]}, headers=a.headers
    ).json()["id"]
    client.delete(f"/api/conversations/{g}/members/{c.user_id}", headers=a.headers)
    clock.advance(seconds=1)
    with ws_session(client, c.token) as carol_ws:
        assert _send(client, a, g, "after removal").status_code == 201
        assert_no_event(carol_ws)
    r = _send(client, c, g, "let me in")
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_active_member"
    bodies = [m["body"] for m in client.get(f"/api/conversations/{g}/messages", headers=c.headers).json()["items"]]
    assert "after removal" not in bodies


def test_non_member_cannot_send_or_read(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    conv = _direct(client, a, b)
    assert _send(client, c, conv, "hi").status_code == 404
    assert client.get(f"/api/conversations/{conv}/messages", headers=c.headers).status_code == 404


def test_non_text_kinds_rejected_until_supported(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "system", "body": "x"},
        headers=a.headers,
    )
    assert r.status_code == 422
