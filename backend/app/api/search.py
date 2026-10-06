from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import CtxDep, SessionDep, UserDep
from app.repositories import messages as message_repo
from app.schemas.conversations import ConversationOut
from app.schemas.messages import MessageOut
from app.schemas.users import UserOut
from app.services.contacts import list_contacts
from app.services.conversations import list_conversations
from app.services.message_views import message_out_many
from app.services.users import users_out

router = APIRouter(tags=["search"])

MAX_PER_GROUP = 20


class SearchOut(BaseModel):
    chats: list[ConversationOut]
    contacts: list[UserOut]
    messages: list[MessageOut]


@router.get("/search", response_model=SearchOut)
async def search(
    q: Annotated[str, Query(min_length=2, max_length=64)], user: UserDep, session: SessionDep, ctx: CtxDep
) -> SearchOut:
    """Signal-style grouped search over my chats, my contacts, and messages I can see."""
    needle = q.strip().lower()
    chats = [
        c for c in await list_conversations(session, ctx, user.id) if needle in c.title.lower()
    ][:MAX_PER_GROUP]
    people = [
        p
        for p in await list_contacts(session, user.id)
        if needle in p.display_name.lower() or needle in (p.username or "") or needle in p.phone
    ][:MAX_PER_GROUP]
    people_out = await users_out(session, ctx, people)
    found = await message_repo.search(session, user.id, needle, MAX_PER_GROUP)
    return SearchOut(
        chats=chats,
        contacts=[people_out[p.id] for p in people],
        messages=await message_out_many(session, ctx, found, user.id),
    )
