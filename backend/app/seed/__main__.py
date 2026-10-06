"""Usage: python -m app.seed [--reset]

--reset deletes the SQLite file at DATABASE_PATH first, then rebuilds and seeds it.
"""

import argparse
import asyncio
from pathlib import Path

from app.clock import SystemClock
from app.config import Settings
from app.db import create_engine, create_session_factory
from app.models import Base
from app.seed.build import seed_database


async def main(reset: bool) -> None:
    settings = Settings()
    db = Path(settings.database_path)
    if reset:
        for suffix in ("", "-wal", "-shm"):
            Path(f"{db}{suffix}").unlink(missing_ok=True)
    db.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings.database_path)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_database(create_session_factory(engine), settings, SystemClock())
    await engine.dispose()
    print(f"Seeded {db}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="delete the database file first")
    asyncio.run(main(parser.parse_args().reset))
