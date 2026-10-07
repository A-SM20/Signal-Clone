from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Request
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings

# libpq-style query options that asyncpg doesn't accept as URL parameters.
_LIBPQ_ONLY = {"sslmode", "channel_binding"}


def engine_args(settings: Settings) -> tuple[str, dict]:
    """(SQLAlchemy URL, connect_args): Postgres when DATABASE_URL is set (e.g. Neon), else the SQLite file."""
    if not settings.database_url:
        return f"sqlite+aiosqlite:///{settings.database_path}", {}
    parts = urlsplit(settings.database_url)
    query = dict(parse_qsl(parts.query))
    ssl = query.get("sslmode")
    kept = urlencode({k: v for k, v in query.items() if k not in _LIBPQ_ONLY})
    url = urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, kept, parts.fragment))
    return url, ({"ssl": ssl} if ssl and ssl != "disable" else {})


def is_sqlite(settings: Settings) -> bool:
    return not settings.database_url


def create_engine(settings: Settings) -> AsyncEngine:
    url, connect_args = engine_args(settings)
    if not is_sqlite(settings):
        # Neon suspends idle compute and drops connections; check each one before use.
        return create_async_engine(url, connect_args=connect_args, pool_pre_ping=True, pool_size=5, max_overflow=5)

    engine = create_async_engine(url)

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session
