import pytest
from starlette.websockets import WebSocketDisconnect

from tests.helpers import login, ws_session


def test_list_devices_marks_current(client):
    first = login(client, "+15550100001", "Alice")
    login(client, "+15550100001")
    devices = client.get("/api/devices", headers=first.headers).json()
    assert len(devices) == 2
    assert [d["is_current"] for d in devices].count(True) == 1
    assert {"id", "name", "is_primary", "is_current", "created_at", "last_active_at"} <= set(devices[0])


def test_unlink_revokes_and_closes_socket(client):
    first = login(client, "+15550100001", "Alice")
    second = login(client, "+15550100001")
    second_id = next(d["id"] for d in client.get("/api/devices", headers=second.headers).json() if d["is_current"])
    with ws_session(client, second.token) as ws:
        r = client.delete(f"/api/devices/{second_id}", headers=first.headers)
        assert r.status_code == 204
        assert ws.receive_json()["type"] == "device.revoked"
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4403
    assert client.get("/api/me", headers=second.headers).status_code == 401
    assert len(client.get("/api/devices", headers=first.headers).json()) == 1


def test_cannot_unlink_others_device(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    bob_device = client.get("/api/devices", headers=b.headers).json()[0]["id"]
    assert client.delete(f"/api/devices/{bob_device}", headers=a.headers).status_code == 404
