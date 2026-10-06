from tests.helpers import login


def test_lookup_exact_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.patch("/api/me", json={"username": "bob.02"}, headers=b.headers)
    by_phone = client.get("/api/users/lookup", params={"q": "+15550100002"}, headers=a.headers)
    assert by_phone.status_code == 200 and by_phone.json()["id"] == b.user_id
    by_formatted = client.get("/api/users/lookup", params={"q": "(555) 010-0002"}, headers=a.headers)
    assert by_formatted.json()["id"] == b.user_id
    by_username = client.get("/api/users/lookup", params={"q": "bob.02"}, headers=a.headers)
    assert by_username.json()["id"] == b.user_id
    partial = client.get("/api/users/lookup", params={"q": "555"}, headers=a.headers)
    assert partial.status_code == 404
    partial_name = client.get("/api/users/lookup", params={"q": "bob"}, headers=a.headers)
    assert partial_name.status_code == 404


def test_add_contact_by_phone_and_username(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    client.patch("/api/me", json={"username": "carol.03"}, headers=c.headers)
    r1 = client.post("/api/contacts", json={"phone": "555-010-0002"}, headers=a.headers)
    assert r1.status_code == 201 and r1.json()["id"] == b.user_id
    r2 = client.post("/api/contacts", json={"username": "carol.03"}, headers=a.headers)
    assert r2.status_code == 201 and r2.json()["id"] == c.user_id
    ids = [u["id"] for u in client.get("/api/contacts", headers=a.headers).json()]
    assert set(ids) == {b.user_id, c.user_id}


def test_add_unknown_contact_404(client):
    a = login(client, "+15550100001", "Alice")
    r = client.post("/api/contacts", json={"phone": "+15550109999"}, headers=a.headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "user_not_found"


def test_add_duplicate_contact_409(client):
    a = login(client, "+15550100001", "Alice")
    login(client, "+15550100002", "Bob")
    client.post("/api/contacts", json={"phone": "+15550100002"}, headers=a.headers)
    r = client.post("/api/contacts", json={"phone": "+15550100002"}, headers=a.headers)
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_contact"


def test_add_self_400(client):
    a = login(client, "+15550100001", "Alice")
    r = client.post("/api/contacts", json={"phone": "+15550100001"}, headers=a.headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "cannot_add_self"


def test_contacts_sorted_by_name(client):
    a = login(client, "+15550100001", "Alice")
    login(client, "+15550100002", "Zed")
    login(client, "+15550100003", "Bea")
    for phone in ("+15550100002", "+15550100003"):
        client.post("/api/contacts", json={"phone": phone}, headers=a.headers)
    names = [u["display_name"] for u in client.get("/api/contacts", headers=a.headers).json()]
    assert names == ["Bea", "Zed"]


def test_remove_contact(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.post("/api/contacts", json={"phone": "+15550100002"}, headers=a.headers)
    assert client.delete(f"/api/contacts/{b.user_id}", headers=a.headers).status_code == 204
    assert client.get("/api/contacts", headers=a.headers).json() == []


def test_block_unblock_roundtrip(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    assert client.post(f"/api/blocks/{b.user_id}", headers=a.headers).status_code == 204
    assert client.post(f"/api/blocks/{b.user_id}", headers=a.headers).status_code == 204  # idempotent
    assert [u["id"] for u in client.get("/api/blocks", headers=a.headers).json()] == [b.user_id]
    assert client.delete(f"/api/blocks/{b.user_id}", headers=a.headers).status_code == 204
    assert client.get("/api/blocks", headers=a.headers).json() == []


def test_block_self_400(client):
    a = login(client, "+15550100001", "Alice")
    assert client.post(f"/api/blocks/{a.user_id}", headers=a.headers).status_code == 400
