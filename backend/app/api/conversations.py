from fastapi import APIRouter, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CtxDep, SessionDep, UserDep, admin_of, member_of
from app.context import Ctx
from app.errors import AppError
from app.models import Conversation
from app.repositories.conversations import membership
from app.schemas.conversations import (
    RequestActionIn,
    AddMembersIn,
    ConversationOut,
    ConversationPatch,
    DirectIn,
    GroupIn,
    MyStatePatch,
    RoleIn,
)
from app.services import conversations as svc
from app.services import requests as request_svc
from app.services.files import delete_file, save_avatar

router = APIRouter(prefix="/conversations", tags=["conversations"])


async def _view(session: AsyncSession, ctx: Ctx, conversation_id: int, user_id: int) -> ConversationOut:
    return await svc.conversation_out(session, ctx, conversation_id, user_id)


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: UserDep, session: SessionDep, ctx: CtxDep) -> list[ConversationOut]:
    return await svc.list_conversations(session, ctx, user.id)


@router.post("/direct", response_model=ConversationOut, responses={201: {"model": ConversationOut}})
async def open_direct(body: DirectIn, user: UserDep, session: SessionDep, ctx: CtxDep, response: Response):
    conversation, created = await svc.get_or_create_direct(session, ctx, user, body.user_id)
    response.status_code = 201 if created else 200
    return await _view(session, ctx, conversation.id, user.id)


@router.post("/groups", response_model=ConversationOut, status_code=201)
async def create_group(body: GroupIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> ConversationOut:
    conversation = await svc.create_group(session, ctx, user, body.title, body.member_ids, body.description)
    return await _view(session, ctx, conversation.id, user.id)


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> ConversationOut:
    await member_of(session, conversation_id, user.id, active=False)
    return await _view(session, ctx, conversation_id, user.id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: int, body: ConversationPatch, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    conversation = await session.get(Conversation, conversation_id)
    if conversation is not None and conversation.kind == "group":
        await admin_of(session, conversation_id, user.id)  # group settings are admin-only
    else:
        await member_of(session, conversation_id, user.id, active=True)
    await svc.update_conversation(session, ctx, user, conversation, body.model_dump(exclude_unset=True))
    return await _view(session, ctx, conversation_id, user.id)


@router.patch("/{conversation_id}/me", response_model=ConversationOut)
async def update_my_state(
    conversation_id: int, body: MyStatePatch, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    member = await member_of(session, conversation_id, user.id, active=False)
    await svc.update_my_state(session, member, body.model_dump(exclude_unset=True))
    return await _view(session, ctx, conversation_id, user.id)


@router.post("/{conversation_id}/members", response_model=ConversationOut)
async def add_members(
    conversation_id: int, body: AddMembersIn, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    await admin_of(session, conversation_id, user.id)
    conversation = await session.get_one(Conversation, conversation_id)
    await svc.add_members(session, ctx, user, conversation, body.user_ids)
    return await _view(session, ctx, conversation_id, user.id)


@router.delete("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
async def remove_member(
    conversation_id: int, user_id: int, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    """An admin removing someone, or anyone removing themselves (leaving)."""
    if user_id == user.id:
        await member_of(session, conversation_id, user.id, active=True)
    else:
        await admin_of(session, conversation_id, user.id)
    target = await membership(session, conversation_id, user_id)
    if target is None or target.left_at is not None:
        raise AppError(404, "not_found", "Not a member")
    conversation = await session.get_one(Conversation, conversation_id)
    await svc.remove_member(session, ctx, user, conversation, target)
    return await _view(session, ctx, conversation_id, user.id)


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
async def change_role(
    conversation_id: int, user_id: int, body: RoleIn, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    await admin_of(session, conversation_id, user.id)
    target = await membership(session, conversation_id, user_id)
    if target is None:
        raise AppError(404, "not_found", "Not a member")
    conversation = await session.get_one(Conversation, conversation_id)
    await svc.set_role(session, ctx, user, conversation, target, body.role)
    return await _view(session, ctx, conversation_id, user.id)


@router.post("/{conversation_id}/avatar", response_model=ConversationOut)
async def upload_group_avatar(
    conversation_id: int, file: UploadFile, user: UserDep, session: SessionDep, ctx: CtxDep
) -> ConversationOut:
    await admin_of(session, conversation_id, user.id)
    conversation = await session.get_one(Conversation, conversation_id)
    if conversation.kind != "group":
        raise AppError(400, "not_a_group", "Only groups have their own photo")
    old = conversation.avatar_path
    conversation.avatar_path = await save_avatar(ctx, file)
    await session.commit()
    delete_file(ctx, old)
    await svc.publish_conversation(session, ctx, conversation_id, await svc.active_member_ids(session, conversation_id))
    return await _view(session, ctx, conversation_id, user.id)


@router.post("/{conversation_id}/request", responses={200: {"model": ConversationOut}, 204: {"description": "Request blocked or deleted"}})
async def resolve_request(
    conversation_id: int, body: RequestActionIn, user: UserDep, session: SessionDep, ctx: CtxDep
):
    member = await member_of(session, conversation_id, user.id, active=True)
    if await request_svc.resolve(session, ctx, member, body.action):
        return await _view(session, ctx, conversation_id, user.id)
    return Response(status_code=204)
