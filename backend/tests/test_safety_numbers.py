import base64

from sqlalchemy import select

from app.models import IdentityVerification
from app.services.safety_numbers import compute_safety_number, fingerprint_half
from tests.helpers import db_call, login

KA, KB = bytes(range(32)), bytes(range(32, 64))
# Recorded from the first green run; guards against accidental algorithm changes.
GOLDEN = "749091284385070456433574050315500210663287021562611322209120"


def test_symmetric():
    assert compute_safety_number(KA, 1, KB, 2) == compute_safety_number(KB, 2, KA, 1)


def test_sixty_digits():
    s = compute_safety_number(KA, 1, KB, 2)
    assert len(s) == 60 and s.isdigit()


def test_halves_are_30_digits_and_ordered_by_user_id():
    s = compute_safety_number(KA, 1, KB, 2)
    assert s == fingerprint_half(KA, b"1") + fingerprint_half(KB, b"2")


def test_depends_on_keys():
    assert compute_safety_number(KA, 1, KB, 2) != compute_safety_number(KA, 1, bytes(32), 2)


def test_golden_vector():
    assert compute_safety_number(KA, 1, KB, 2) == GOLDEN


def test_verify_roundtrip(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    sn = client.get(f"/api/users/{b.user_id}/safety-number", headers=a.headers).json()
    assert len(sn["digits"]) == 60 and sn["verified"] is False and sn["changed"] is False
    assert sn["qr_payload"] == "v0:" + sn["digits"]
    assert client.get(f"/api/users/{a.user_id}/safety-number", headers=b.headers).json()["digits"] == sn["digits"]
    assert client.post(f"/api/users/{b.user_id}/verification", headers=a.headers).json()["verified"] is True
    assert client.delete(f"/api/users/{b.user_id}/verification", headers=a.headers).json()["verified"] is False


def test_changed_when_snapshot_stale(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    client.post(f"/api/users/{b.user_id}/verification", headers=a.headers)

    async def stale(s):
        v = await s.scalar(select(IdentityVerification))
        v.verified_key = base64.b64encode(bytes(32)).decode()

    db_call(client, stale)
    sn = client.get(f"/api/users/{b.user_id}/safety-number", headers=a.headers).json()
    assert sn["changed"] is True and sn["verified"] is False
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()
    assert conv["safety_number_changed"] is True


def test_safety_number_for_unknown_user_404(client):
    a = login(client, "+15550100001", "Alice")
    assert client.get("/api/users/999/safety-number", headers=a.headers).status_code == 404
