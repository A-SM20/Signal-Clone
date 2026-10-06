from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CtxDep, SessionDep, UserDep, member_of
from app.errors import AppError
from app.models import Message, User
from app.schemas.messages import MessageOut, MessagePage, SendMessageIn
from app.schemas.users import UserOut
from app.services import messages as svc
from app.services.receipts import message_details
from app.services.users import users_out

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


class RecipientStatusOut(BaseModel):
    user: UserOut
    status: str


class MessageDetailsOut(BaseModel):
    recipients: list[RecipientStatusOut]


@router.get("/messages/{message_id}/details", response_model=MessageDetailsOut)
async def get_message_details(message_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> MessageDetailsOut:
    message = await session.get(Message, message_id)
    if message is None:
        raise AppError(404, "not_found", "Message not found")
    await member_of(session, message.conversation_id, user.id, active=False)
    if message.sender_id != user.id:
        raise AppError(403, "not_sender", "Only the sender can see delivery details")
    rows = await message_details(session, message, user.id)
    people = list(await session.scalars(select(User).where(User.id.in_([uid for uid, _ in rows]))))
    outs = await users_out(session, ctx, people)
    return MessageDetailsOut(recipients=[RecipientStatusOut(user=outs[uid], status=st) for uid, st in rows])
