from app.config import Settings


def test_cors_origins_accepts_comma_separated(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, http://localhost:3000")
    assert Settings().cors_origins == ["https://a.example", "http://localhost:3000"]


def test_cors_origins_accepts_json_list(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://a.example"]')
    assert Settings().cors_origins == ["https://a.example"]


def test_neon_url_is_converted_for_asyncpg():
    from app.db import engine_args

    url, connect_args = engine_args(
        Settings(database_url="postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require&channel_binding=require")
    )
    assert url == "postgresql+asyncpg://u:p@ep-x.neon.tech/neondb"
    assert connect_args == {"ssl": "require"}


def test_sqlite_used_without_database_url():
    from app.db import engine_args

    url, connect_args = engine_args(Settings(database_url=None, database_path="./data/x.db"))
    assert url == "sqlite+aiosqlite:///./data/x.db" and connect_args == {}
