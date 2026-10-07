import asyncio
import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.clock import FrozenClock
from app.config import Settings
from app.main import create_app


@pytest.fixture
def clock():
    return FrozenClock(datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc))


# Set TEST_DATABASE_URL (a disposable Postgres database) to run the whole suite against Postgres;
# every test then starts from an empty schema. Otherwise each test gets its own SQLite file.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def _reset_postgres(settings: Settings) -> None:
    from app.db import create_engine
    from app.models import Base

    async def run():
        engine = create_engine(settings)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    asyncio.run(run())


def make_settings(tmp_path, **overrides) -> Settings:
    settings = Settings(
        database_url=TEST_DATABASE_URL,
        database_path=str(tmp_path / "test.db"),
        seed_on_empty=False,
        sweepers_enabled=False,
        **overrides,
    )
    if TEST_DATABASE_URL:
        _reset_postgres(settings)
    return settings


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
    app = create_app(make_settings(tmp_path, ws_auth_timeout_seconds=0.5, ws_idle_timeout_seconds=1.0), clock=clock)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def seeded_client(tmp_path, clock):
    settings = make_settings(tmp_path)
    settings.seed_on_empty = True
    with TestClient(create_app(settings, clock=clock)) as c:
        yield c
