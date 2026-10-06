"""Upload validation, on-disk storage and HMAC-signed download URLs."""

import hashlib
import hmac
import io
import re
import uuid
from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.constants import MAX_UPLOAD_BYTES
from app.context import Ctx
from app.errors import AppError

ALLOWED_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
}
AUDIO_TYPES = {m for m in ALLOWED_TYPES if m.startswith("audio/")}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MIME_BY_EXT = {ext: mime for mime, ext in ALLOWED_TYPES.items()}
STORAGE_KEY = re.compile(r"^[0-9a-f]{32}\.[a-z0-9]{1,5}$")
CHUNK = 1024 * 1024
AVATAR_SIZE = 512


@dataclass(frozen=True)
class StoredFile:
    storage_key: str
    mime_type: str
    size_bytes: int
    original_name: str
    width: int | None
    height: int | None


def _base_mime(content_type: str | None) -> str:
    return (content_type or "").split(";")[0].strip().lower()


async def _read_limited(upload: UploadFile) -> bytes:
    buf = bytearray()
    while chunk := await upload.read(CHUNK):
        buf.extend(chunk)
        if len(buf) > MAX_UPLOAD_BYTES:
            raise AppError(413, "too_large", "Files can be at most 10 MB")
    return bytes(buf)


def _image_size(data: bytes) -> tuple[int, int]:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise AppError(400, "unsupported_type", "That image could not be read") from None


def _write(ctx: Ctx, ext: str, data: bytes) -> str:
    key = uuid.uuid4().hex + ext
    path = Path(ctx.settings.upload_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


async def save_upload(ctx: Ctx, upload: UploadFile, *, allowed: Collection[str] = ALLOWED_TYPES) -> StoredFile:
    mime = _base_mime(upload.content_type)
    if mime not in allowed or mime not in ALLOWED_TYPES:
        raise AppError(400, "unsupported_type", "That file type isn't supported")
    data = await _read_limited(upload)
    width = height = None
    if mime in IMAGE_TYPES:
        width, height = _image_size(data)
    # The server picks the stored name; the uploaded filename is display-only.
    key = _write(ctx, ALLOWED_TYPES[mime], data)
    name = Path(upload.filename or "file").name[:200]
    return StoredFile(key, mime, len(data), name, width, height)


async def save_avatar(ctx: Ctx, upload: UploadFile) -> str:
    """Square-crops and resizes to 512x512 JPEG; returns the storage key."""
    mime = _base_mime(upload.content_type)
    if mime not in IMAGE_TYPES:
        raise AppError(400, "unsupported_type", "Profile photos must be images")
    data = await _read_limited(upload)
    _image_size(data)
    with Image.open(io.BytesIO(data)) as img:
        square = ImageOps.fit(ImageOps.exif_transpose(img).convert("RGB"), (AVATAR_SIZE, AVATAR_SIZE))
        out = io.BytesIO()
        square.save(out, format="JPEG", quality=85)
    return _write(ctx, ".jpg", out.getvalue())


def _signature(ctx: Ctx, key: str, exp: int) -> str:
    return hmac.new(ctx.settings.signing_secret.encode(), f"{key}:{exp}".encode(), hashlib.sha256).hexdigest()


def sign_path(ctx: Ctx, storage_key: str) -> str:
    """URL valid for 1-2 h; identical within a clock hour so browsers can cache it."""
    now = int(ctx.clock.now().timestamp())
    exp = (now // 3600 + 2) * 3600
    return f"/api/files/{storage_key}?exp={exp}&sig={_signature(ctx, storage_key, exp)}"


def resolve_signed(ctx: Ctx, key: str, exp: int, sig: str) -> Path:
    """Validates a signed request and returns the file path (raises AppError otherwise)."""
    if not STORAGE_KEY.fullmatch(key):
        raise AppError(404, "not_found", "File not found")
    if not hmac.compare_digest(_signature(ctx, key, exp), sig):
        raise AppError(403, "bad_signature", "Invalid file link")
    if ctx.clock.now().timestamp() > exp:
        raise AppError(403, "expired", "This file link has expired")
    path = Path(ctx.settings.upload_dir) / key
    if not path.is_file():
        raise AppError(404, "not_found", "File not found")
    return path


def delete_file(ctx: Ctx, storage_key: str | None) -> None:
    if storage_key and STORAGE_KEY.fullmatch(storage_key):
        (Path(ctx.settings.upload_dir) / storage_key).unlink(missing_ok=True)
