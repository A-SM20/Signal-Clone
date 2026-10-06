from fastapi import APIRouter, UploadFile

from app.api.deps import CtxDep, SessionDep, UserDep
from app.schemas.messages import AttachmentOut
from app.services import attachments as svc

router = APIRouter(tags=["attachments"])


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(file: UploadFile, user: UserDep, session: SessionDep, ctx: CtxDep) -> AttachmentOut:
    """Upload first, then reference the returned id in a `media` message's attachment_ids."""
    attachment = await svc.upload(session, ctx, user, file)
    return svc.to_out(ctx, attachment)
