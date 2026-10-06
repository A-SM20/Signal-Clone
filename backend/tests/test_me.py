from tests.helpers import login


def test_me_returns_profile_and_settings(client):
    s = login(client, "+15550100001", "Alice Chen")
    me = client.get("/api/me", headers=s.headers).json()
    assert me["display_name"] == "Alice Chen"
    assert me["avatar_color"].startswith("#")
    assert me["settings"]["read_receipts"] is True and me["settings"]["theme"] == "system"


def test_patch_me_username(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    ok = client.patch("/api/me", json={"username": "alice.01"}, headers=a.headers)
    assert ok.status_code == 200 and ok.json()["username"] == "alice.01"
    bad = client.patch("/api/me", json={"username": "Al"}, headers=a.headers)
    assert bad.status_code == 422
    taken = client.patch("/api/me", json={"username": "alice.01"}, headers=b.headers)
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "username_taken"


def test_patch_me_rejects_blank_name(client):
    a = login(client, "+15550100001", "Alice")
    assert client.patch("/api/me", json={"display_name": "   "}, headers=a.headers).status_code == 422


def test_settings_roundtrip(client):
    a = login(client, "+15550100001", "Alice")
    r = client.patch("/api/me/settings", json={"read_receipts": False, "theme": "dark"}, headers=a.headers)
    assert r.status_code == 200
    got = client.get("/api/me/settings", headers=a.headers).json()
    assert got["read_receipts"] is False and got["theme"] == "dark"


def test_settings_validates_values(client):
    a = login(client, "+15550100001", "Alice")
    assert client.patch("/api/me/settings", json={"theme": "neon"}, headers=a.headers).status_code == 422
    r = client.patch("/api/me/settings", json={"default_disappearing_seconds": 45}, headers=a.headers)
    assert r.status_code == 422
