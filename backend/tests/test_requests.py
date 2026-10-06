import uuid

from tests.helpers import assert_no_event, befriend, login, ws_session


def _send(client, s, conv, body="hi"):
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _receipt(ws, conv, kind, up_to):
    ws.send_json({"type": "receipt", "data": {"conversation_id": conv, "kind": kind, "up_to_message_id": up_to}})


def _contact(client, owner, phone):
    client.post("/api/contacts", json={"phone": phone}, headers=owner.headers)


def _users(client):
    alice = login(client, "+15550100001", "Alice")
    jordan = login(client, "+15550100008", "Jordan")
    return alice, jordan


def _view(client, s, conv):
    return client.get(f"/api/conversations/{conv}", headers=s.headers)


def _dm(client, frm, to):
    return client.post("/api/conversations/direct", json={"user_id": to.user_id}, headers=frm.headers).json()["id"]


def test_stranger_dm_is_pending_for_recipient(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    assert _view(client, alice, conv).json()["me"]["request_state"] == "pending"
    assert _view(client, jordan, conv).json()["me"]["request_state"] == "accepted"


def test_contact_dm_is_accepted(client):
    alice, jordan = _users(client)
    client.post("/api/contacts", json={"phone": "+15550100008"}, headers=alice.headers)
    conv = _dm(client, jordan, alice)
    assert _view(client, alice, conv).json()["me"]["request_state"] == "accepted"


def test_pending_suppresses_receipts_and_typing(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    msg = _send(client, jordan, conv)
    with ws_session(client, jordan.token) as jordan_ws, ws_session(client, alice.token) as alice_ws:
        _receipt(alice_ws, conv, "read", msg["id"])
        alice_ws.send_json({"type": "typing", "data": {"conversation_id": conv, "state": "start"}})
        assert_no_event(alice_ws)
        # Jordan may see Alice's presence (co-member), but never a receipt or typing from her.
        for _ in range(2):
            frame = jordan_ws.receive_json()
            if frame["type"] == "pong":
                break
            assert frame["type"] == "presence"
            jordan_ws.send_json({"type": "ping"})
    member = next(m for m in _view(client, jordan, conv).json()["members"] if m["user"]["id"] == alice.user_id)
    assert member["last_read_message_id"] is None and member["last_delivered_message_id"] is None


def test_accept_enables_receipts(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    msg = _send(client, jordan, conv)
    r = client.post(f"/api/conversations/{conv}/request", json={"action": "accept"}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["me"]["request_state"] == "accepted"
    with ws_session(client, jordan.token) as jordan_ws, ws_session(client, alice.token) as alice_ws:
        _receipt(alice_ws, conv, "read", msg["id"])
        for _ in range(4):
            frame = jordan_ws.receive_json()
            if frame["type"] == "receipt.updated":
                assert frame["data"]["read_up_to"] == msg["id"]
                break
        else:
            raise AssertionError("no receipt")


def test_pending_recipient_cannot_send_until_accepted(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": "who?"},
        headers=alice.headers,
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "request_pending"


def test_block_removes_and_silences(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    _send(client, jordan, conv, "first")
    with ws_session(client, alice.token) as alice_ws:
        r = client.post(f"/api/conversations/{conv}/request", json={"action": "block"}, headers=alice.headers)
        assert r.status_code == 204
        frame = alice_ws.receive_json()
        while frame["type"] != "conversation.removed":
            frame = alice_ws.receive_json()
        assert frame["data"] == {"conversation_id": conv}
        later = _send(client, jordan, conv, "are you there?")  # Jordan still gets 201 (blocking is silent)
        assert_no_event(alice_ws)
    assert [u["id"] for u in client.get("/api/blocks", headers=alice.headers).json()] == [jordan.user_id]
    assert conv not in [c["id"] for c in client.get("/api/conversations", headers=alice.headers).json()]
    bodies = [m["body"] for m in client.get("/api/search", params={"q": "there"}, headers=alice.headers).json()["messages"]]
    assert later["body"] not in bodies


def test_blocked_sender_hidden_in_groups(client):
    alice, jordan = _users(client)
    bob = login(client, "+15550100002", "Bob")
    befriend(client, alice, bob)
    befriend(client, jordan, bob)
    g = client.post(
        "/api/conversations/groups", json={"title": "G", "member_ids": [alice.user_id, jordan.user_id]}, headers=bob.headers
    ).json()["id"]
    client.post(f"/api/blocks/{jordan.user_id}", headers=alice.headers)
    _send(client, jordan, g, "spam")
    _send(client, bob, g, "hello")
    bodies = [m["body"] for m in client.get(f"/api/conversations/{g}/messages", headers=alice.headers).json()["items"]]
    assert "spam" not in bodies and "hello" in bodies
    assert _view(client, alice, g).json()["last_message"]["body"] == "hello"


def test_delete_then_new_message_recreates_request(client):
    alice, jordan = _users(client)
    conv = _dm(client, jordan, alice)
    _send(client, jordan, conv)
    assert client.post(f"/api/conversations/{conv}/request", json={"action": "delete"}, headers=alice.headers).status_code == 204
    assert _view(client, alice, conv).status_code == 404
    _send(client, jordan, conv, "again")
    assert _view(client, alice, conv).json()["me"]["request_state"] == "pending"


def test_group_add_by_non_contact_is_pending(client):
    alice, jordan = _users(client)
    bob = login(client, "+15550100002", "Bob")
    _contact(client, alice, "+15550100002")
    g1 = client.post("/api/conversations/groups", json={"title": "Strangers", "member_ids": [alice.user_id]}, headers=jordan.headers).json()["id"]
    g2 = client.post("/api/conversations/groups", json={"title": "Friends", "member_ids": [alice.user_id]}, headers=bob.headers).json()["id"]
    assert _view(client, alice, g1).json()["me"]["request_state"] == "pending"
    assert _view(client, alice, g2).json()["me"]["request_state"] == "accepted"


def test_request_action_only_when_pending(client):
    alice, jordan = _users(client)
    client.post("/api/contacts", json={"phone": "+15550100008"}, headers=alice.headers)
    conv = _dm(client, jordan, alice)
    r = client.post(f"/api/conversations/{conv}/request", json={"action": "accept"}, headers=alice.headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "not_a_request"
