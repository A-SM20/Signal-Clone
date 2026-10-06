from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CtxDep, SessionDep, UserDep
from app.errors import AppError
from app.schemas.people import AddContactIn
from app.schemas.users import UserOut
from app.services import contacts as contacts_service
from app.services import safety_numbers as sn
from app.services.users import users_out

router = APIRouter(tags=["people"])


@router.get("/users/lookup", response_model=UserOut)
async def lookup_user(
    q: Annotated[str, Query(min_length=1, max_length=40)], user: UserDep, session: SessionDep, ctx: CtxDep
) -> UserOut:
    found = await contacts_service.find_user(session, q)
    if found is None:
        raise AppError(404, "user_not_found", "No Signal user with that number or username")
    return (await users_out(session, ctx, [found]))[found.id]


@router.get("/contacts", response_model=list[UserOut])
async def list_contacts(user: UserDep, session: SessionDep, ctx: CtxDep) -> list[UserOut]:
    people = await contacts_service.list_contacts(session, user.id)
    out = await users_out(session, ctx, people)
    return [out[p.id] for p in people]


@router.post("/contacts", response_model=UserOut, status_code=201)
async def add_contact(body: AddContactIn, user: UserDep, session: SessionDep, ctx: CtxDep) -> UserOut:
    other = await contacts_service.add_contact(session, ctx, user, body.query)
    return (await users_out(session, ctx, [other]))[other.id]


@router.delete("/contacts/{user_id}", status_code=204)
async def remove_contact(user_id: int, user: UserDep, session: SessionDep) -> Response:
    await contacts_service.remove_contact(session, user.id, user_id)
    return Response(status_code=204)


@router.get("/blocks", response_model=list[UserOut])
async def list_blocks(user: UserDep, session: SessionDep, ctx: CtxDep) -> list[UserOut]:
    people = await contacts_service.list_blocked(session, user.id)
    out = await users_out(session, ctx, people)
    return [out[p.id] for p in people]


@router.post("/blocks/{user_id}", status_code=204)
async def block_user(user_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> Response:
    await contacts_service.block(session, ctx, user.id, user_id)
    return Response(status_code=204)


@router.delete("/blocks/{user_id}", status_code=204)
async def unblock_user(user_id: int, user: UserDep, session: SessionDep) -> Response:
    await contacts_service.unblock(session, user.id, user_id)
    return Response(status_code=204)


@router.get("/users/{user_id}/safety-number", response_model=sn.SafetyNumberOut)
async def get_safety_number(user_id: int, user: UserDep, session: SessionDep) -> sn.SafetyNumberOut:
    return await sn.safety_number(session, user, await sn.get_subject(session, user_id))


@router.post("/users/{user_id}/verification", response_model=sn.SafetyNumberOut)
async def verify(user_id: int, user: UserDep, session: SessionDep, ctx: CtxDep) -> sn.SafetyNumberOut:
    subject = await sn.get_subject(session, user_id)
    await sn.mark_verified(session, ctx, user, subject)
    return await sn.safety_number(session, user, subject)


@router.delete("/users/{user_id}/verification", response_model=sn.SafetyNumberOut)
async def unverify(user_id: int, user: UserDep, session: SessionDep) -> sn.SafetyNumberOut:
    subject = await sn.get_subject(session, user_id)
    await sn.clear_verification(session, user, subject)
    return await sn.safety_number(session, user, subject)
