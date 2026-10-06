import pytest

from app.realtime.events import envelope
from app.realtime.hub import Hub

pytestmark = pytest.mark.anyio


class FakeSocket:
    def __init__(self, fail: bool = False):
        self.sent: list[dict] = []
        self.fail = fail
        self.closed_with: int | None = None

    async def send_json(self, data):
        if self.fail:
            raise RuntimeError("socket gone")
        self.sent.append(data)

    async def close(self, code: int = 1000):
        self.closed_with = code


async def test_register_reports_first_device_online():
    hub = Hub()
    assert await hub.register(1, 10, FakeSocket()) is True
    assert await hub.register(1, 11, FakeSocket()) is False
    assert hub.is_online(1)


async def test_unregister_reports_last_device_offline():
    hub = Hub()
    await hub.register(1, 10, FakeSocket())
    await hub.register(1, 11, FakeSocket())
    assert await hub.unregister(1, 10) is False
    assert await hub.unregister(1, 11) is True
    assert hub.is_online(1) is False


async def test_send_to_users_reaches_every_device():
    hub = Hub()
    a1, a2, b = FakeSocket(), FakeSocket(), FakeSocket()
    await hub.register(1, 10, a1)
    await hub.register(1, 11, a2)
    await hub.register(2, 20, b)
    await hub.send_to_users([1], {"type": "x"})
    assert a1.sent == [{"type": "x"}] and a2.sent == [{"type": "x"}] and b.sent == []


async def test_failing_socket_is_dropped():
    hub = Hub()
    await hub.register(1, 10, FakeSocket(fail=True))
    await hub.send_to_users([1], {"type": "x"})
    assert hub.is_online(1) is False


async def test_send_to_device_and_close_device():
    hub = Hub()
    a1, a2 = FakeSocket(), FakeSocket()
    await hub.register(1, 10, a1)
    await hub.register(1, 11, a2)
    await hub.send_to_device(11, {"type": "y"})
    await hub.close_device(11, 4403)
    assert a1.sent == [] and a2.sent == [{"type": "y"}]
    assert a2.closed_with == 4403


def test_envelope_shape():
    e = envelope("typing", {"conversation_id": 1})
    assert set(e) == {"type", "data", "ts"} and e["type"] == "typing"
