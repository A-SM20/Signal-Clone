import uuid

from tests.helpers import login, ws_session


def _setup(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]
    msg = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": "hello"},
        headers=a.headers,
    ).json()
    return a, b, conv, msg


def _react(client, s, msg_id, emoji):
    return client.put(f"/api/messages/{msg_id}/reaction", json={"emoji": emoji}, headers=s.headers)


def _reactions(client, s, conv):
    return client.get(f"/api/conversations/{conv}/messages", headers=s.headers).json()["items"][0]["reactions"]


def _until(ws, type_, limit=6):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(type_)


def test_reaction_replace_semantics(client):
    a, b, conv, msg = _setup(client)
    assert _react(client, b, msg["id"], "👍").status_code == 200
    assert _react(client, b, msg["id"], "❤️").status_code == 200
    assert _reactions(client, a, conv) == [{"user_id": b.user_id, "emoji": "❤️"}]


def test_multiple_people_react(client):
    a, b, conv, msg = _setup(client)
    _react(client, a, msg["id"], "😂")
    _react(client, b, msg["id"], "😂")
    assert sorted(r["user_id"] for r in _reactions(client, a, conv)) == sorted([a.user_id, b.user_id])


def test_reaction_remove(client):
    a, b, conv, msg = _setup(client)
    _react(client, b, msg["id"], "👍")
    assert client.delete(f"/api/messages/{msg['id']}/reaction", headers=b.headers).status_code == 200
    assert _reactions(client, a, conv) == []


def test_reaction_event_broadcast(client):
    a, b, conv, msg = _setup(client)
    with ws_session(client, a.token) as alice_ws:
        _react(client, b, msg["id"], "😮")
        frame = _until(alice_ws, "reaction.updated")
        assert frame["data"] == {
            "conversation_id": conv, "message_id": msg["id"], "reactions": [{"user_id": b.user_id, "emoji": "😮"}],
        }


def test_reaction_non_member_404(client):
    a, b, conv, msg = _setup(client)
    c = login(client, "+15550100003", "Carol")
    assert _react(client, c, msg["id"], "👍").status_code == 404


def test_reaction_emoji_validated(client):
    a, b, conv, msg = _setup(client)
    assert _react(client, b, msg["id"], "").status_code == 422
    assert _react(client, b, msg["id"], "not an emoji at all").status_code == 422
