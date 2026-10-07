import io
from urllib.parse import parse_qs, urlparse

from PIL import Image

from tests.helpers import login


def png_bytes(size=(64, 48), color=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _upload_avatar(client, s, data=None, name="me.png", mime="image/png"):
    return client.post("/api/me/avatar", files={"file": (name, data or png_bytes(), mime)}, headers=s.headers)


def test_avatar_upload_sets_avatar_url(client):
    a = login(client, "+15550100001", "Alice")
    r = _upload_avatar(client, a)
    assert r.status_code == 200
    url = r.json()["avatar_url"]
    assert url.startswith("/api/files/") and "sig=" in url and "exp=" in url
    assert client.get("/api/me", headers=a.headers).json()["avatar_url"] == url


def test_signed_url_roundtrip(client):
    a = login(client, "+15550100001", "Alice")
    url = _upload_avatar(client, a).json()["avatar_url"]
    r = client.get(url)  # no auth header needed: the signature is the credential
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/")
    assert Image.open(io.BytesIO(r.content)).size == (512, 512)


def test_oversize_rejected_413(client):
    a = login(client, "+15550100001", "Alice")
    big = b"\x89PNG" + b"0" * (10 * 1024 * 1024)
    r = _upload_avatar(client, a, data=big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


def test_unsupported_type_400(client):
    a = login(client, "+15550100001", "Alice")
    r = _upload_avatar(client, a, data=b"MZ...", name="evil.exe", mime="application/x-msdownload")
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_type"


def test_fake_image_rejected(client):
    a = login(client, "+15550100001", "Alice")
    r = _upload_avatar(client, a, data=b"not really a png")
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_type"


def test_tampered_signature_403(client):
    a = login(client, "+15550100001", "Alice")
    url = _upload_avatar(client, a).json()["avatar_url"]
    parsed = urlparse(url)
    q = parse_qs(parsed.query)
    r = client.get(parsed.path, params={"exp": q["exp"][0], "sig": "0" * 64})
    assert r.status_code == 403 and r.json()["error"]["code"] == "bad_signature"


def test_expired_signature_403(client, clock):
    a = login(client, "+15550100001", "Alice")
    url = _upload_avatar(client, a).json()["avatar_url"]
    clock.advance(hours=3)
    r = client.get(url)
    assert r.status_code == 403 and r.json()["error"]["code"] == "expired"


def test_url_stable_within_the_hour(client, clock):
    a = login(client, "+15550100001", "Alice")
    first = _upload_avatar(client, a).json()["avatar_url"]
    clock.advance(minutes=1)
    assert client.get("/api/me", headers=a.headers).json()["avatar_url"] == first


def test_path_traversal_key_404(client):
    r = client.get("/api/files/..%2f..%2fetc%2fpasswd", params={"exp": "9999999999", "sig": "0" * 64})
    assert r.status_code == 404
    r2 = client.get("/api/files/notahexkey.png", params={"exp": "9999999999", "sig": "0" * 64})
    assert r2.status_code == 404


def test_group_avatar_admin_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = client.post("/api/conversations/groups", json={"title": "G", "member_ids": [b.user_id]}, headers=a.headers).json()
    files = {"file": ("g.png", png_bytes(), "image/png")}
    assert client.post(f"/api/conversations/{g['id']}/avatar", files=files, headers=b.headers).status_code == 403
    r = client.post(f"/api/conversations/{g['id']}/avatar", files=files, headers=a.headers)
    assert r.status_code == 200 and r.json()["avatar_url"].startswith("/api/files/")


def test_files_are_stored_in_the_database(client):
    """Render's disk is wiped on restart; file bytes must live with the (persistent) database."""
    from sqlalchemy import select

    from app.models import StoredFile
    from tests.helpers import db_call

    a = login(client, "+15550100001", "Alice")
    url = _upload_avatar(client, a).json()["avatar_url"]
    key = urlparse(url).path.rsplit("/", 1)[1]
    stored = db_call(client, lambda s: s.scalar(select(StoredFile).where(StoredFile.key == key)))
    assert stored is not None and stored.data == client.get(url).content


def test_byte_ranges_for_media_seeking(client):
    a = login(client, "+15550100001", "Alice")
    url = _upload_avatar(client, a).json()["avatar_url"]
    full = client.get(url).content
    r = client.get(url, headers={"Range": "bytes=10-19"})
    assert r.status_code == 206 and r.content == full[10:20]
    assert r.headers["content-range"] == f"bytes 10-19/{len(full)}"
    tail = client.get(url, headers={"Range": "bytes=-5"})
    assert tail.status_code == 206 and tail.content == full[-5:]
    assert client.get(url, headers={"Range": f"bytes={len(full)}-"}).status_code == 416
