import uuid

from tests.helpers import befriend, login, ws_session


def _setup(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    group = client.post(
        "/api/conversations/groups", json={"title": "Hike", "member_ids": [b.user_id]}, headers=a.headers
    ).json()
    return a, b, group["id"]


def _create(client, s, conv, options=("Eagle Peak", "Mount Tam"), allow_multiple=False, question="Which trail?"):
    return client.post(
        f"/api/conversations/{conv}/messages",
        json={
            "client_id": str(uuid.uuid4()),
            "kind": "poll",
            "poll": {"question": question, "options": list(options), "allow_multiple": allow_multiple},
        },
        headers=s.headers,
    )


def _vote(client, s, message_id, option_ids):
    return client.put(f"/api/polls/{message_id}/votes", json={"option_ids": option_ids}, headers=s.headers)


def _until(ws, type_, limit=8):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(type_)


def test_create_poll_message(client):
    a, b, conv = _setup(client)
    r = _create(client, a, conv)
    assert r.status_code == 201, r.text
    poll = r.json()["poll"]
    assert poll["question"] == "Which trail?" and poll["allow_multiple"] is False and poll["ended_at"] is None
    assert [o["text"] for o in poll["options"]] == ["Eagle Peak", "Mount Tam"]
    assert all(o["vote_count"] == 0 and o["voter_ids"] == [] for o in poll["options"])
    listed = client.get(f"/api/conversations/{conv}/messages", headers=b.headers).json()["items"][0]
    assert listed["kind"] == "poll" and listed["poll"]["question"] == "Which trail?"


def test_option_count_bounds(client):
    a, b, conv = _setup(client)
    assert _create(client, a, conv, options=["only one"]).status_code == 422
    assert _create(client, a, conv, options=[f"o{i}" for i in range(11)]).status_code == 422
    assert _create(client, a, conv, options=["same", "same"]).status_code == 422
    assert _create(client, a, conv, question="  ").status_code == 422


def test_single_choice_rejects_two(client):
    a, b, conv = _setup(client)
    poll = _create(client, a, conv).json()
    ids = [o["id"] for o in poll["poll"]["options"]]
    assert _vote(client, b, poll["id"], ids).status_code == 422


def test_vote_replace_and_retract(client):
    a, b, conv = _setup(client)
    poll = _create(client, a, conv, options=["x", "y", "z"], allow_multiple=True).json()
    x, y, z = (o["id"] for o in poll["poll"]["options"])
    _vote(client, b, poll["id"], [x, y])
    r = _vote(client, b, poll["id"], [z])
    assert r.status_code == 200
    counts = {o["id"]: o["vote_count"] for o in r.json()["options"]}
    assert counts == {x: 0, y: 0, z: 1}
    r = _vote(client, b, poll["id"], [])
    assert all(o["vote_count"] == 0 for o in r.json()["options"])


def test_vote_rejects_foreign_option(client):
    a, b, conv = _setup(client)
    p1 = _create(client, a, conv).json()
    p2 = _create(client, a, conv).json()
    assert _vote(client, b, p1["id"], [p2["poll"]["options"][0]["id"]]).status_code == 422


def test_end_poll_creator_only_then_votes_rejected(client):
    a, b, conv = _setup(client)
    poll = _create(client, a, conv).json()
    r = client.post(f"/api/polls/{poll['id']}/end", headers=b.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_creator"
    r = client.post(f"/api/polls/{poll['id']}/end", headers=a.headers)
    assert r.status_code == 200 and r.json()["ended_at"] is not None
    r = _vote(client, b, poll["id"], [poll["poll"]["options"][0]["id"]])
    assert r.status_code == 400 and r.json()["error"]["code"] == "poll_ended"


def test_poll_updated_payload(client):
    a, b, conv = _setup(client)
    poll = _create(client, a, conv).json()
    first = poll["poll"]["options"][0]["id"]
    with ws_session(client, a.token) as alice_ws:
        _vote(client, b, poll["id"], [first])
        data = _until(alice_ws, "poll.updated")["data"]
    assert data["conversation_id"] == conv and data["message_id"] == poll["id"]
    option = next(o for o in data["options"] if o["id"] == first)
    assert option["vote_count"] == 1 and option["voter_ids"] == [b.user_id]


def test_delete_for_everyone_removes_poll(client):
    a, b, conv = _setup(client)
    poll = _create(client, a, conv).json()
    client.delete(f"/api/messages/{poll['id']}?scope=everyone", headers=a.headers)
    item = client.get(f"/api/conversations/{conv}/messages", headers=b.headers).json()["items"][0]
    assert item["poll"] is None
    assert _vote(client, b, poll["id"], []).status_code == 404
