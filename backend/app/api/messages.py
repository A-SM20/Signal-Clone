from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CtxDep, SessionDep, UserDep, member_of
from app.errors import AppError
from app.models import Message, User
from app.schemas.messages import EditMessageIn, MessageOut, MessagePage, ReactionOut, RevisionOut, SendMessageIn
from app.schemas.users import UserOut
from app.services import edits, pins
from app.services import messages as svc
from app.services import reactions as reaction_svc
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


async def _visible_message(session, message_id: int, user_id: int, *, active: bool) -> Message:
    """Loads a message the caller may see; non-members get 404."""
    message = await session.get(Message, message_id)
    if message is None:
        raise AppError(404, "not_found", "Message not found")
    await member_of(session, message.conversation_id, user_id, active=active)
    return message


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16, pattern=r"^\S+$")


class ReactionsOut(BaseModel):
    reactions: list[ReactionOut]


@router.put("/messages/{message_id}/reaction", response_model=ReactionsOut)
async def put_reaction(message_id: int, body: ReactionIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> ReactionsOut:
    message = await _visible_message(session, message_id, user.id, active=True)
    return ReactionsOut(reactions=await reaction_svc.react(session, ctx, user, message, body.emoji))


@router.delete("/messages/{message_id}/reaction", response_model=ReactionsOut)
async def delete_reaction(message_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> ReactionsOut:
    message = await _visible_message(session, message_id, user.id, active=True)
    return ReactionsOut(reactions=await reaction_svc.unreact(session, ctx, user, message))


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(message_id: int, body: EditMessageIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> MessageOut:
    message = await _visible_message(session, message_id, user.id, active=True)
    return await edits.edit_message(session, ctx, user, message, body.body)


@router.get("/messages/{message_id}/revisions", response_model=list[RevisionOut])
async def list_revisions(message_id: int, user: UserDep, session: SessionDep) -> list[RevisionOut]:
    message = await _visible_message(session, message_id, user.id, active=False)
    return await edits.revisions(session, message)


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: int, user: UserDep, session: SessionDep, ctx: CtxDep, scope: Literal["me", "everyone"] = "me"
) -> Response:
    message = await _visible_message(session, message_id, user.id, active=scope == "everyone")
    if scope == "everyone":
        await edits.delete_for_everyone(session, ctx, user, message)
    else:
        await edits.delete_for_me(session, ctx, user, message)
    return Response(status_code=204)


class PinIn(BaseModel):
    duration: Literal["24h", "7d", "30d", "forever"] = "forever"


class OkOut(BaseModel):
    ok: bool = True


@router.post("/messages/{message_id}/pin", response_model=OkOut)
async def pin_message(message_id: int, body: PinIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> OkOut:
    message = await _visible_message(session, message_id, user.id, active=True)
    member = await member_of(session, message.conversation_id, user.id, active=True)
    await pins.pin(session, ctx, member, message, body.duration)
    return OkOut()


@router.delete("/messages/{message_id}/pin", response_model=OkOut)
async def unpin_message(message_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> OkOut:
    message = await _visible_message(session, message_id, user.id, active=True)
    member = await member_of(session, message.conversation_id, user.id, active=True)
    await pins.unpin(session, ctx, member, message)
    return OkOut()
