import uuid

from tests.helpers import login


def _send(client, s, conv_id, body):
    r = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "text", "body": body},
        headers=s.headers,
    )
    assert r.status_code == 201


def test_search_groups_results(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob Hiker")
    client.post("/api/contacts", json={"phone": "+15550100002"}, headers=a.headers)
    g = client.post("/api/conversations/groups", json={"title": "Hiking Club", "member_ids": [b.user_id]}, headers=a.headers).json()
    _send(client, a, g["id"], "Who brings the hiking poles?")
    r = client.get("/api/search", params={"q": "hik"}, headers=a.headers).json()
    assert [c["id"] for c in r["chats"]] == [g["id"]]
    assert [u["id"] for u in r["contacts"]] == [b.user_id]
    assert [m["body"] for m in r["messages"]] == ["Who brings the hiking poles?"]


def test_search_excludes_other_peoples_conversations(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    conv = client.post("/api/conversations/direct", json={"user_id": c.user_id}, headers=b.headers).json()["id"]
    _send(client, b, conv, "secret plans")
    r = client.get("/api/search", params={"q": "secret"}, headers=a.headers).json()
    assert r["messages"] == [] and r["chats"] == []


def test_search_matches_direct_chat_by_other_name(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bobby Tables")
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]
    r = client.get("/api/search", params={"q": "tables"}, headers=a.headers).json()
    assert [c["id"] for c in r["chats"]] == [conv]


def test_search_query_too_short(client):
    a = login(client, "+15550100001", "Alice")
    assert client.get("/api/search", params={"q": "a"}, headers=a.headers).status_code == 422
