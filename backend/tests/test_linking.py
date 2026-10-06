import re

from tests.helpers import login


def _request(client, name="Chrome on Windows"):
    r = client.post("/api/link-requests", json={"device_name": name})
    assert r.status_code == 201, r.text
    return r.json()


def _poll(client, req, secret=None):
    return client.get(f"/api/link-requests/{req['id']}", headers={"X-Poll-Secret": secret or req["poll_secret"]})


def test_link_happy_path(client):
    a = login(client, "+15550100001", "Alice")
    req = _request(client)
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}", req["code"])
    assert _poll(client, req).json() == {"status": "pending"}
    r = client.post("/api/link-requests/approve", json={"code": req["code"].lower()}, headers=a.headers)
    assert r.status_code == 200, r.text
    body = _poll(client, req).json()
    assert body["status"] == "approved" and body["user"]["id"] == a.user_id
    me = client.get("/api/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["id"] == a.user_id


def test_token_returned_once(client):
    a = login(client, "+15550100001", "Alice")
    req = _request(client)
    client.post("/api/link-requests/approve", json={"code": req["code"]}, headers=a.headers)
    assert "token" in _poll(client, req).json()
    assert _poll(client, req).json() == {"status": "approved"}


def test_wrong_poll_secret_403(client):
    req = _request(client)
    r = _poll(client, req, secret="nope")
    assert r.status_code == 403 and r.json()["error"]["code"] == "bad_secret"


def test_expired_request(client, clock):
    a = login(client, "+15550100001", "Alice")
    req = _request(client)
    clock.advance(minutes=6)
    r = client.post("/api/link-requests/approve", json={"code": req["code"]}, headers=a.headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "invalid_code"
    assert _poll(client, req).json() == {"status": "expired"}


def test_code_cannot_be_approved_twice(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    req = _request(client)
    client.post("/api/link-requests/approve", json={"code": req["code"]}, headers=a.headers)
    r = client.post("/api/link-requests/approve", json={"code": req["code"]}, headers=b.headers)
    assert r.status_code == 404


def test_linked_device_appears_in_list(client):
    a = login(client, "+15550100001", "Alice")
    req = _request(client, name="Firefox on Linux")
    client.post("/api/link-requests/approve", json={"code": req["code"]}, headers=a.headers)
    _poll(client, req)
    devices = client.get("/api/devices", headers=a.headers).json()
    linked = next(d for d in devices if d["name"] == "Firefox on Linux")
    assert linked["is_primary"] is False and linked["is_current"] is False
