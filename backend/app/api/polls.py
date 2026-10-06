from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import CtxDep, SessionDep, UserDep, member_of
from app.errors import AppError
from app.models import Message
from app.schemas.messages import PollOut
from app.services import polls as svc

router = APIRouter(prefix="/polls", tags=["polls"])


class VotesIn(BaseModel):
    option_ids: list[int]


async def _poll_message(session, message_id: int, user_id: int) -> Message:
    message = await session.get(Message, message_id)
    if message is None or message.kind != "poll" or message.deleted_at is not None:
        raise AppError(404, "not_found", "Poll not found")
    await member_of(session, message.conversation_id, user_id, active=True)
    return message


@router.put("/{message_id}/votes", response_model=PollOut)
async def put_votes(message_id: int, body: VotesIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> PollOut:
    message = await _poll_message(session, message_id, user.id)
    return await svc.vote(session, ctx, user, message, body.option_ids)


@router.post("/{message_id}/end", response_model=PollOut)
async def end_poll(message_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> PollOut:
    message = await _poll_message(session, message_id, user.id)
    return await svc.end(session, ctx, user, message)
