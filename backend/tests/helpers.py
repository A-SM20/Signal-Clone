from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession


def db_call(client, fn: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
    """Run `async fn(session)` on the app's event loop and commit."""

    async def runner():
        async with client.app.state.session_factory() as session:
            result = await fn(session)
            await session.commit()
            return result

    return client.portal.call(runner)
