from dataclasses import dataclass

from fastapi import Request

from app.clock import Clock
from app.config import Settings
from app.realtime.hub import Hub


@dataclass(frozen=True)
class Ctx:
    """Everything a service needs besides the DB session."""

    settings: Settings
    clock: Clock
    hub: Hub


def get_ctx(request: Request) -> Ctx:
    state = request.app.state
    return Ctx(settings=state.settings, clock=state.clock, hub=state.hub)
