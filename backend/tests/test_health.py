from sqlalchemy import text

from tests.helpers import db_call


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_sqlite_pragmas(client):
    async def q(s):
        fk = (await s.execute(text("PRAGMA foreign_keys"))).scalar()
        jm = (await s.execute(text("PRAGMA journal_mode"))).scalar()
        return fk, jm

    assert db_call(client, q) == (1, "wal")


def test_cors_allows_configured_origin(client):
    r = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
