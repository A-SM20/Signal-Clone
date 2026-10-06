from typing import Annotated, Literal

from fastapi import APIRouter, Form, UploadFile

from app.api.deps import CtxDep, SessionDep, UserDep
from app.schemas.messages import AttachmentOut
from app.services import attachments as svc

router = APIRouter(tags=["attachments"])


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    file: UploadFile,
    user: UserDep,
    session: SessionDep,
    ctx: CtxDep,
    kind: Annotated[Literal["voice"] | None, Form()] = None,
    duration_ms: Annotated[int | None, Form()] = None,
    waveform: Annotated[str | None, Form(description="JSON array of 64 ints 0–255")] = None,
) -> AttachmentOut:
    """Upload first, then reference the returned id in a `media` (or `voice`) message's attachment_ids."""
    if kind == "voice":
        attachment = await svc.upload_voice(session, ctx, user, file, duration_ms, waveform)
    else:
        attachment = await svc.upload(session, ctx, user, file)
    return svc.to_out(ctx, attachment)
