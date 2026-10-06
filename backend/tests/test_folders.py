from tests.helpers import befriend, login


def _folder(client, s, **fields):
    body = {"name": "Work", "include_direct": False, "include_groups": False, "unread_only": False, "conversation_ids": []}
    return client.post("/api/folders", json={**body, **fields}, headers=s.headers)


def test_folder_crud_owner_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]

    r = _folder(client, a, name="Work", conversation_ids=[conv])
    assert r.status_code == 201, r.text
    folder = r.json()
    assert folder["name"] == "Work" and folder["conversation_ids"] == [conv] and folder["position"] == 0
    assert [f["id"] for f in client.get("/api/folders", headers=a.headers).json()] == [folder["id"]]
    assert client.get("/api/folders", headers=b.headers).json() == []

    r = client.patch(f"/api/folders/{folder['id']}", json={"name": "Office", "unread_only": True}, headers=a.headers)
    assert r.status_code == 200 and r.json()["name"] == "Office" and r.json()["unread_only"] is True
    assert client.patch(f"/api/folders/{folder['id']}", json={"name": "x"}, headers=b.headers).status_code == 404
    assert client.delete(f"/api/folders/{folder['id']}", headers=b.headers).status_code == 404
    assert client.delete(f"/api/folders/{folder['id']}", headers=a.headers).status_code == 204
    assert client.get("/api/folders", headers=a.headers).json() == []


def test_folder_rejects_chats_i_am_not_in(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Cara")
    befriend(client, b, c)
    theirs = client.post("/api/conversations/direct", json={"user_id": c.user_id}, headers=b.headers).json()["id"]
    assert _folder(client, a, conversation_ids=[theirs]).status_code == 422


def test_folder_name_required(client):
    a = login(client, "+15550100001", "Alice")
    assert _folder(client, a, name="   ").status_code == 422


def test_reorder_requires_permutation(client):
    a = login(client, "+15550100001", "Alice")
    ids = [_folder(client, a, name=n).json()["id"] for n in ("One", "Two", "Three")]
    assert client.put("/api/folders/order", json={"ids": ids[:2]}, headers=a.headers).status_code == 422
    assert client.put("/api/folders/order", json={"ids": [ids[0], ids[0], ids[1]]}, headers=a.headers).status_code == 422
    r = client.put("/api/folders/order", json={"ids": list(reversed(ids))}, headers=a.headers)
    assert r.status_code == 200
    assert [f["id"] for f in client.get("/api/folders", headers=a.headers).json()] == list(reversed(ids))
