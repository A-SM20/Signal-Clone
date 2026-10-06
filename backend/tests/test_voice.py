import json
import uuid

from tests.helpers import befriend, login

WAVE = [i * 4 % 256 for i in range(64)]


def _setup(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    befriend(client, a, b)
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]
    return a, b, conv


def _upload_voice(client, s, duration_ms=7000, waveform=WAVE, mime="audio/webm"):
    data = {"kind": "voice", "duration_ms": str(duration_ms)}
    if waveform is not None:
        data["waveform"] = json.dumps(waveform)
    return client.post(
        "/api/attachments", data=data, files={"file": ("voice.webm", b"\x1aE\xdf\xa3fake-opus", mime)}, headers=s.headers
    )


def _send_voice(client, s, conv, ids):
    return client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "voice", "attachment_ids": ids},
        headers=s.headers,
    )


def test_voice_message_requires_metadata(client):
    a, b, conv = _setup(client)
    assert _upload_voice(client, a, waveform=None).status_code == 422
    assert _upload_voice(client, a, duration_ms=301000).status_code == 422
    assert _upload_voice(client, a, duration_ms=0).status_code == 422
    assert _upload_voice(client, a, waveform=[1, 2, 3]).status_code == 422
    assert _upload_voice(client, a, waveform=[300] * 64).status_code == 422
    assert _upload_voice(client, a, mime="image/png").status_code == 422


def test_voice_message_roundtrip(client):
    a, b, conv = _setup(client)
    r = _upload_voice(client, a)
    assert r.status_code == 201, r.text
    att = r.json()
    assert att["kind"] == "voice" and att["duration_ms"] == 7000 and att["waveform"] == WAVE
    r = _send_voice(client, a, conv, [att["id"]])
    assert r.status_code == 201, r.text
    item = client.get(f"/api/conversations/{conv}/messages", headers=b.headers).json()["items"][0]
    assert item["kind"] == "voice" and item["attachments"][0]["duration_ms"] == 7000


def test_voice_message_needs_exactly_one_voice_attachment(client):
    a, b, conv = _setup(client)
    v1 = _upload_voice(client, a).json()["id"]
    v2 = _upload_voice(client, a).json()["id"]
    assert _send_voice(client, a, conv, []).status_code == 422
    assert _send_voice(client, a, conv, [v1, v2]).status_code == 422


def test_media_message_rejects_voice_attachment(client):
    a, b, conv = _setup(client)
    v = _upload_voice(client, a).json()["id"]
    r = client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": str(uuid.uuid4()), "kind": "media", "attachment_ids": [v]},
        headers=a.headers,
    )
    assert r.status_code == 400
