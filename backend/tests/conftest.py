from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.clock import FrozenClock
from app.config import Settings
from app.main import create_app


@pytest.fixture
def clock():
    return FrozenClock(datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc))


def make_settings(tmp_path, **overrides) -> Settings:
    return Settings(
        database_path=str(tmp_path / "test.db"),
        upload_dir=str(tmp_path / "uploads"),
        seed_on_empty=False,
        **overrides,
    )


@pytest.fixture
def app(tmp_path, clock):
    return create_app(make_settings(tmp_path), clock=clock)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client_fast_timeouts(tmp_path, clock):
    app = create_app(make_settings(tmp_path, ws_auth_timeout_seconds=0.2, ws_idle_timeout_seconds=0.3), clock=clock)
    with TestClient(app) as c:
        yield c
