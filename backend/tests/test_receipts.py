import uuid

from tests.helpers import assert_no_event, befriend, login, ws_session


def _direct(client, a, b):
    befriend(client, a, b)
    return client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]


def _send(client, s, conv, body="hi"):
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    )
    assert r.status_code == 201
    return r.json()


def _receipt(ws, conv, kind, up_to):
    ws.send_json({"type": "receipt", "data": {"conversation_id": conv, "kind": kind, "up_to_message_id": up_to}})


def _typing(ws, conv, state):
    ws.send_json({"type": "typing", "data": {"conversation_id": conv, "state": state}})


def _until(ws, type_, limit=6):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(f"no {type_}")


def _member(view, user_id):
    return next(m for m in view["members"] if m["user"]["id"] == user_id)


def test_delivered_receipt_reaches_sender(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    msg = _send(client, a, conv)
    with ws_session(client, a.token) as alice_ws, ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, conv, "delivered", msg["id"])
        frame = _until(alice_ws, "receipt.updated")
        assert frame["data"] == {
            "conversation_id": conv, "user_id": b.user_id, "delivered_up_to": msg["id"], "read_up_to": 0,
        }


def test_read_advances_delivered_and_clears_unread(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    msg = _send(client, a, conv)
    with ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, conv, "read", msg["id"])
        assert_no_event(bob_ws)  # also guarantees the frame was processed
    bob_member = _member(client.get(f"/api/conversations/{conv}", headers=a.headers).json(), b.user_id)
    assert bob_member["last_read_message_id"] == msg["id"] and bob_member["last_delivered_message_id"] == msg["id"]
    assert client.get(f"/api/conversations/{conv}", headers=b.headers).json()["unread_count"] == 0


def test_cursor_never_moves_backwards(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    first = _send(client, a, conv)
    second = _send(client, a, conv)
    with ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, conv, "read", second["id"])
        _receipt(bob_ws, conv, "read", first["id"])
        _receipt(bob_ws, conv, "read", 10_000)  # clamped to the latest message
        assert_no_event(bob_ws)
    bob_member = _member(client.get(f"/api/conversations/{conv}", headers=a.headers).json(), b.user_id)
    assert bob_member["last_read_message_id"] == second["id"]


def test_read_receipts_off_hides_read(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.patch("/api/me/settings", json={"read_receipts": False}, headers=b.headers)
    conv = _direct(client, a, b)
    msg = _send(client, a, conv)
    with ws_session(client, a.token) as alice_ws, ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, conv, "read", msg["id"])
        frame = _until(alice_ws, "receipt.updated")
        assert frame["data"]["read_up_to"] is None and frame["data"]["delivered_up_to"] == msg["id"]
    assert _member(client.get(f"/api/conversations/{conv}", headers=a.headers).json(), b.user_id)[
        "last_read_message_id"
    ] is None
    assert client.get(f"/api/conversations/{conv}", headers=b.headers).json()["unread_count"] == 0


def test_reciprocity(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.patch("/api/me/settings", json={"read_receipts": False}, headers=a.headers)
    conv = _direct(client, a, b)
    msg = _send(client, a, conv)
    with ws_session(client, a.token) as alice_ws, ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, conv, "read", msg["id"])
        assert _until(alice_ws, "receipt.updated")["data"]["read_up_to"] is None


def test_typing_relayed_to_others_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    with ws_session(client, a.token) as alice_ws, ws_session(client, b.token) as bob_ws:
        assert _until(alice_ws, "presence")["data"]["user_id"] == b.user_id  # Bob came online
        _typing(alice_ws, conv, "start")
        frame = _until(bob_ws, "typing")
        assert frame["data"] == {"conversation_id": conv, "user_id": a.user_id, "state": "start"}
        assert_no_event(alice_ws)


def test_typing_disabled_not_relayed(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.patch("/api/me/settings", json={"typing_indicators": False}, headers=a.headers)
    conv = _direct(client, a, b)
    with ws_session(client, a.token) as alice_ws, ws_session(client, b.token) as bob_ws:
        assert _until(alice_ws, "presence")["data"]["user_id"] == b.user_id  # Bob came online
        _typing(alice_ws, conv, "start")
        assert_no_event(alice_ws)
        assert_no_event(bob_ws)


def test_typing_in_foreign_conversation_ignored(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    conv = _direct(client, a, b)
    with ws_session(client, c.token) as carol_ws, ws_session(client, b.token) as bob_ws:
        _typing(carol_ws, conv, "start")
        assert_no_event(carol_ws)
        assert_no_event(bob_ws)


def test_message_details_per_recipient(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    befriend(client, a, b, c)
    g = client.post(
        "/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id, c.user_id]}, headers=a.headers
    ).json()["id"]
    msg = _send(client, a, g)
    with ws_session(client, b.token) as bob_ws:
        _receipt(bob_ws, g, "read", msg["id"])
        assert_no_event(bob_ws)
    details = client.get(f"/api/messages/{msg['id']}/details", headers=a.headers).json()
    statuses = {r["user"]["id"]: r["status"] for r in details["recipients"]}
    assert statuses == {b.user_id: "read", c.user_id: "sent"}
    assert client.get(f"/api/messages/{msg['id']}/details", headers=b.headers).status_code == 403
