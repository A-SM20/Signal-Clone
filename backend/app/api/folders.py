from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.api.deps import SessionDep, UserDep
from app.services import folders as svc
from app.services.folders import FolderIn, FolderOut, FolderPatch

router = APIRouter(prefix="/folders", tags=["folders"])


class OrderIn(BaseModel):
    ids: list[int]


@router.get("", response_model=list[FolderOut])
async def list_folders(user: UserDep, session: SessionDep) -> list[FolderOut]:
    return await svc.list_folders(session, user)


@router.post("", response_model=FolderOut, status_code=201)
async def create_folder(body: FolderIn, user: UserDep, session: SessionDep) -> FolderOut:
    return await svc.create_folder(session, user, body)


# Declared before /{folder_id} routes so "order" is never parsed as an id.
@router.put("/order", response_model=list[FolderOut])
async def reorder(body: OrderIn, user: UserDep, session: SessionDep) -> list[FolderOut]:
    return await svc.reorder(session, user, body.ids)


@router.patch("/{folder_id}", response_model=FolderOut)
async def update_folder(folder_id: int, body: FolderPatch, user: UserDep, session: SessionDep) -> FolderOut:
    return await svc.update_folder(session, user, folder_id, body)


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(folder_id: int, user: UserDep, session: SessionDep) -> Response:
    await svc.delete_folder(session, user, folder_id)
    return Response(status_code=204)
