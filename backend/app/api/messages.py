from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CtxDep, SessionDep, UserDep, member_of
from app.schemas.messages import MessageOut, MessagePage, SendMessageIn
from app.services import messages as svc

router = APIRouter(tags=["messages"])


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
async def list_messages(
    conversation_id: int,
    user: UserDep,
    session: SessionDep,
    ctx: CtxDep,
    before: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessagePage:
    member = await member_of(session, conversation_id, user.id, active=False)
    return await svc.list_messages(session, ctx, member, before, limit)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
    responses={200: {"model": MessageOut, "description": "Idempotent replay of an existing client_id"}},
)
async def send_message(
    conversation_id: int, body: SendMessageIn, user: UserDep, session: SessionDep, ctx: CtxDep, response: Response
) -> MessageOut:
    member = await member_of(session, conversation_id, user.id, active=True)
    message, created = await svc.send_message(session, ctx, user, member, body)
    if not created:
        response.status_code = 200
    return message
