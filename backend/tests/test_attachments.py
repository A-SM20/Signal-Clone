import uuid

from tests.helpers import login
from tests.test_files import png_bytes


def _direct(client, a, b):
    return client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()["id"]


def _upload(client, s, data=None, name="photo.png", mime="image/png"):
    r = client.post("/api/attachments", files={"file": (name, data or png_bytes(), mime)}, headers=s.headers)
    assert r.status_code == 201, r.text
    return r.json()


def _send_media(client, s, conv, ids, body=None, client_id=None):
    return client.post(
        f"/api/conversations/{conv}/messages",
        json={"client_id": client_id or str(uuid.uuid4()), "kind": "media", "body": body, "attachment_ids": ids},
        headers=s.headers,
    )


def test_upload_returns_metadata(client):
    a = login(client, "+15550100001", "Alice")
    att = _upload(client, a)
    assert att["kind"] == "image" and att["width"] == 64 and att["height"] == 48
    assert att["url"].startswith("/api/files/") and att["original_name"] == "photo.png"


def test_upload_file_kind(client):
    a = login(client, "+15550100001", "Alice")
    att = _upload(client, a, data=b"%PDF-1.4 test", name="plan.pdf", mime="application/pdf")
    assert att["kind"] == "file" and att["width"] is None


def test_upload_then_send_media(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    ids = [_upload(client, a)["id"], _upload(client, a)["id"]]
    r = _send_media(client, a, conv, ids, body="Summit views")
    assert r.status_code == 201
    msg = r.json()
    assert [x["id"] for x in msg["attachments"]] == ids
    assert msg["attachments"][0]["width"] == 64 and msg["body"] == "Summit views"
    page = client.get(f"/api/conversations/{conv}/messages", headers=b.headers).json()["items"]
    assert len(page[0]["attachments"]) == 2
    assert client.get(page[0]["attachments"][0]["url"]).status_code == 200


def test_attachment_only_message_allowed(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    r = _send_media(client, a, conv, [_upload(client, a)["id"]])
    assert r.status_code == 201 and r.json()["body"] is None


def test_media_requires_attachments(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert _send_media(client, a, conv, []).status_code == 422


def test_foreign_attachment_rejected(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    bobs = _upload(client, b)["id"]
    r = _send_media(client, a, conv, [bobs])
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_attachment"


def test_attachment_reuse_rejected(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    att = _upload(client, a)["id"]
    assert _send_media(client, a, conv, [att]).status_code == 201
    r = _send_media(client, a, conv, [att])
    assert r.status_code == 409 and r.json()["error"]["code"] == "attachment_in_use"


def test_replay_with_attachments_is_idempotent(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    att = _upload(client, a)["id"]
    cid = str(uuid.uuid4())
    assert _send_media(client, a, conv, [att], client_id=cid).status_code == 201
    assert _send_media(client, a, conv, [att], client_id=cid).status_code == 200


def test_album_limit(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = _direct(client, a, b)
    assert _send_media(client, a, conv, list(range(1, 12))).status_code == 422
