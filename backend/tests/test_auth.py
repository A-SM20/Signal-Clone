import hashlib

import pytest
from sqlalchemy import select

from app.models import Device
from tests.helpers import db_call, login


def _verify(client, phone, code="123456"):
    return client.post("/api/auth/verify-otp", json={"phone": phone, "code": code, "device_name": "pytest"})


def test_new_user_flow(client):
    r = client.post("/api/auth/request-otp", json={"phone": "+15550109999"})
    assert r.status_code == 200 and r.json() == {"is_new_user": True}
    first = _verify(client, "+15550109999")
    assert first.status_code == 200
    body = first.json()
    assert body["is_new_user"] is True and body["token"] and body["user"]["phone"] == "+15550109999"
    assert client.post("/api/auth/request-otp", json={"phone": "+15550109999"}).json() == {"is_new_user": False}
    assert _verify(client, "+15550109999").json()["is_new_user"] is False


def test_wrong_otp_rejected(client):
    r = _verify(client, "+15550109999", code="000000")
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_otp"


@pytest.mark.parametrize("raw", ["555-010-0001", "(555) 010-0001", "+1 555 010 0001", "15550100001"])
def test_phone_variants_reach_same_account(client, raw):
    canonical = login(client, "+15550100001", "Alice")
    variant = login(client, raw)
    assert variant.user_id == canonical.user_id


def test_invalid_phone(client):
    r = client.post("/api/auth/request-otp", json={"phone": "12"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_phone"


def test_token_is_stored_hashed(client):
    s = login(client, "+15550100001", "Alice")

    async def hashes(session):
        return [d.token_hash for d in (await session.execute(select(Device))).scalars()]

    stored = db_call(client, hashes)
    assert s.token not in stored
    assert hashlib.sha256(s.token.encode()).hexdigest() in stored


def test_logout_revokes(client):
    s = login(client, "+15550100001", "Alice")
    assert client.post("/api/auth/logout", headers=s.headers).status_code == 204
    r = client.get("/api/me", headers=s.headers)
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_missing_token_401(client):
    r = client.get("/api/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_first_device_is_primary(client):
    login(client, "+15550100001", "Alice")
    login(client, "+15550100001")

    async def flags(session):
        return [d.is_primary for d in (await session.execute(select(Device).order_by(Device.id))).scalars()]

    assert db_call(client, flags) == [True, False]
