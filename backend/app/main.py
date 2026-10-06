import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import attachments, auth, conversations, devices, files, health, me, messages, people, search
from app.clock import Clock, SystemClock
from app.config import Settings
from app.db import create_engine, create_session_factory
from app.errors import install_error_handlers
from app.models import Base
from app.realtime import ws_router
from app.realtime.hub import Hub
from app.seed.build import seed_database
from app.context import Ctx
from app.tasks.sweepers import run_every, sweep_expired


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    settings = settings or Settings()
    clock = clock or SystemClock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
        Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
        engine = create_engine(settings.database_path)
        app.state.engine = engine
        app.state.session_factory = create_session_factory(engine)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        if settings.seed_on_empty:
            await seed_database(app.state.session_factory, settings, clock)
        ctx = Ctx(settings=settings, clock=clock, hub=app.state.hub)
        jobs = []
        if settings.sweepers_enabled:
            jobs.append(asyncio.create_task(run_every(5, lambda: sweep_expired(app.state.session_factory, ctx))))
        yield
        for job in jobs:
            job.cancel()
        if app.state.background_tasks:  # let detached work (e.g. presence) finish
            await asyncio.wait(list(app.state.background_tasks), timeout=5)
        await engine.dispose()

    app = FastAPI(title="Signal Clone API", lifespan=lifespan)
    app.state.settings = settings
    app.state.clock = clock
    app.state.hub = Hub()
    app.state.background_tasks = set()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for router in (health.router, auth.router, me.router, devices.router, people.router, conversations.router, messages.router, search.router, files.router, attachments.router, ws_router.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
