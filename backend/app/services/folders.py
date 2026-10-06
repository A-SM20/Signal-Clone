"""Chat folders: per-user tabs over the chat list. Filtering happens on the client; this stores the rules."""

from typing import Annotated

from pydantic import AfterValidator, BaseModel, StringConstraints
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import ChatFolder, ChatFolderConversation, ConversationMember, User


def _nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value.strip()


FolderName = Annotated[str, StringConstraints(max_length=32), AfterValidator(_nonblank)]


class FolderIn(BaseModel):
    name: FolderName
    include_direct: bool = False
    include_groups: bool = False
    unread_only: bool = False
    conversation_ids: list[int] = []


class FolderPatch(BaseModel):
    name: FolderName | None = None
    include_direct: bool | None = None
    include_groups: bool | None = None
    unread_only: bool | None = None
    conversation_ids: list[int] | None = None


class FolderOut(BaseModel):
    id: int
    name: str
    position: int
    include_direct: bool
    include_groups: bool
    unread_only: bool
    conversation_ids: list[int]


async def _chat_ids(session: AsyncSession, folder_ids: list[int]) -> dict[int, list[int]]:
    rows = await session.execute(
        select(ChatFolderConversation.folder_id, ChatFolderConversation.conversation_id)
        .where(ChatFolderConversation.folder_id.in_(folder_ids))
        .order_by(ChatFolderConversation.conversation_id)
    )
    grouped: dict[int, list[int]] = {fid: [] for fid in folder_ids}
    for fid, cid in rows:
        grouped[fid].append(cid)
    return grouped


def _out(f: ChatFolder, chats: list[int]) -> FolderOut:
    return FolderOut(
        id=f.id,
        name=f.name,
        position=f.position,
        include_direct=f.include_direct,
        include_groups=f.include_groups,
        unread_only=f.unread_only,
        conversation_ids=chats,
    )


async def list_folders(session: AsyncSession, user: User) -> list[FolderOut]:
    folders = list(
        await session.scalars(
            select(ChatFolder).where(ChatFolder.owner_id == user.id).order_by(ChatFolder.position, ChatFolder.id)
        )
    )
    chats = await _chat_ids(session, [f.id for f in folders])
    return [_out(f, chats[f.id]) for f in folders]


async def _owned(session: AsyncSession, user: User, folder_id: int) -> ChatFolder:
    folder = await session.get(ChatFolder, folder_id)
    if folder is None or folder.owner_id != user.id:  # someone else's folder looks like no folder
        raise AppError(404, "not_found", "Folder not found")
    return folder


async def _set_chats(session: AsyncSession, user: User, folder: ChatFolder, conversation_ids: list[int]) -> None:
    wanted = set(conversation_ids)
    mine = set(
        await session.scalars(
            select(ConversationMember.conversation_id).where(
                ConversationMember.user_id == user.id, ConversationMember.conversation_id.in_(wanted)
            )
        )
    )
    if wanted - mine:
        raise AppError(422, "invalid_chat", "You can only add chats you're in")
    await session.execute(delete(ChatFolderConversation).where(ChatFolderConversation.folder_id == folder.id))
    session.add_all(ChatFolderConversation(folder_id=folder.id, conversation_id=cid) for cid in sorted(wanted))


async def create_folder(session: AsyncSession, user: User, data: FolderIn) -> FolderOut:
    position = await session.scalar(
        select(func.coalesce(func.max(ChatFolder.position) + 1, 0)).where(ChatFolder.owner_id == user.id)
    )
    folder = ChatFolder(
        owner_id=user.id,
        name=data.name,
        position=position,
        include_direct=data.include_direct,
        include_groups=data.include_groups,
        unread_only=data.unread_only,
    )
    session.add(folder)
    await session.flush()
    await _set_chats(session, user, folder, data.conversation_ids)
    await session.commit()
    return _out(folder, sorted(set(data.conversation_ids)))


async def update_folder(session: AsyncSession, user: User, folder_id: int, data: FolderPatch) -> FolderOut:
    folder = await _owned(session, user, folder_id)
    changes = data.model_dump(exclude_unset=True, exclude={"conversation_ids"})
    for field, value in changes.items():
        if value is not None:
            setattr(folder, field, value)
    if data.conversation_ids is not None:
        await _set_chats(session, user, folder, data.conversation_ids)
    await session.commit()
    return _out(folder, (await _chat_ids(session, [folder.id]))[folder.id])


async def delete_folder(session: AsyncSession, user: User, folder_id: int) -> None:
    folder = await _owned(session, user, folder_id)
    await session.delete(folder)
    await session.commit()


async def reorder(session: AsyncSession, user: User, ids: list[int]) -> list[FolderOut]:
    folders = {f.id: f for f in await session.scalars(select(ChatFolder).where(ChatFolder.owner_id == user.id))}
    if len(ids) != len(set(ids)) or set(ids) != set(folders):
        raise AppError(422, "invalid_order", "Send every one of your folders exactly once")
    for position, fid in enumerate(ids):
        folders[fid].position = position
    await session.commit()
    return await list_folders(session, user)
