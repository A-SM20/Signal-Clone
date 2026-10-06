from app.config import Settings


def test_cors_origins_accepts_comma_separated(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, http://localhost:3000")
    assert Settings().cors_origins == ["https://a.example", "http://localhost:3000"]


def test_cors_origins_accepts_json_list(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://a.example"]')
    assert Settings().cors_origins == ["https://a.example"]
