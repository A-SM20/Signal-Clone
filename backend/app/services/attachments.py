from collections import defaultdict

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.context import Ctx
from app.errors import AppError
from app.models import Attachment, Message, User
from app.schemas.messages import AttachmentOut
from app.services.files import IMAGE_TYPES, delete_file, save_upload, sign_path


def to_out(ctx: Ctx, a: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        kind=a.kind,
        mime_type=a.mime_type,
        size_bytes=a.size_bytes,
        original_name=a.original_name,
        url=sign_path(ctx, a.storage_key),
        width=a.width,
        height=a.height,
        duration_ms=a.duration_ms,
        waveform=a.waveform,
    )


async def upload(session: AsyncSession, ctx: Ctx, uploader: User, file: UploadFile, **extra) -> Attachment:
    stored = await save_upload(ctx, file)
    kind = extra.pop("kind", None) or ("image" if stored.mime_type in IMAGE_TYPES else "file")
    attachment = Attachment(
        uploader_id=uploader.id,
        kind=kind,
        mime_type=stored.mime_type,
        size_bytes=stored.size_bytes,
        original_name=stored.original_name,
        storage_key=stored.storage_key,
        width=stored.width,
        height=stored.height,
        created_at=ctx.clock.now(),
        **extra,
    )
    session.add(attachment)
    await session.commit()
    return attachment


async def link(session: AsyncSession, sender: User, message: Message, ids: list[int]) -> None:
    """Attach previously uploaded files to a new message, in the given order."""
    if not ids:
        return
    rows = {a.id: a for a in await session.scalars(select(Attachment).where(Attachment.id.in_(ids)))}
    for position, attachment_id in enumerate(ids):
        a = rows.get(attachment_id)
        if a is None or a.uploader_id != sender.id:
            raise AppError(400, "invalid_attachment", "Attachment not found")
        if a.message_id is not None:
            raise AppError(409, "attachment_in_use", "That attachment was already sent")
        a.message_id = message.id
        a.position = position


async def for_messages(session: AsyncSession, message_ids: list[int]) -> dict[int, list[Attachment]]:
    if not message_ids:
        return {}
    grouped: dict[int, list[Attachment]] = defaultdict(list)
    rows = await session.scalars(
        select(Attachment).where(Attachment.message_id.in_(message_ids)).order_by(Attachment.position)
    )
    for a in rows:
        grouped[a.message_id].append(a)
    return grouped


async def purge_for_messages(session: AsyncSession, ctx: Ctx, message_ids: list[int]) -> None:
    """Deletes attachment rows and their files (used by delete-for-everyone and disappearing messages)."""
    for attachments in (await for_messages(session, message_ids)).values():
        for a in attachments:
            delete_file(ctx, a.storage_key)
            await session.delete(a)
