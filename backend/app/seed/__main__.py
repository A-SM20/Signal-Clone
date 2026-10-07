"""Usage: python -m app.seed [--reset]

--reset wipes the database first (drops every table on Postgres, deletes the SQLite file otherwise),
then rebuilds and seeds it.
"""

import argparse
import asyncio
from pathlib import Path

from app.clock import SystemClock
from app.config import Settings
from app.db import create_engine, create_session_factory, is_sqlite
from app.models import Base
from app.seed.build import seed_database


async def main(reset: bool) -> None:
    settings = Settings()
    db = Path(settings.database_path)
    if is_sqlite(settings):
        if reset:
            for suffix in ("", "-wal", "-shm"):
                Path(f"{db}{suffix}").unlink(missing_ok=True)
        db.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings)
    async with engine.begin() as conn:
        if reset and not is_sqlite(settings):
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await seed_database(create_session_factory(engine), settings, SystemClock())
    await engine.dispose()
    print("Seeded " + ("the Postgres database" if not is_sqlite(settings) else str(db)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="delete the database file first")
    asyncio.run(main(parser.parse_args().reset))
