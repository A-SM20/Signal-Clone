import re

from fastapi import APIRouter, Header, Response

from app.api.deps import CtxDep, SessionDep
from app.errors import AppError
from app.models import StoredFile
from app.services.files import check_signed

router = APIRouter(tags=["files"])

_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _byte_range(header: str, size: int) -> tuple[int, int] | None:
    """(start, end) inclusive for a single-range header; None if it should be ignored. Raises 416 if unsatisfiable."""
    match = _RANGE.match(header.strip())
    if not match or match.groups() == ("", ""):
        return None
    first, last = match.groups()
    if first == "":  # suffix range: the last N bytes
        length = int(last)
        if length == 0:
            raise AppError(416, "bad_range", "Requested range not satisfiable")
        return max(0, size - length), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or start > end:
        raise AppError(416, "bad_range", "Requested range not satisfiable")
    return start, end


@router.get("/files/{key}")
async def download(
    key: str, exp: int, sig: str, ctx: CtxDep, session: SessionDep, range_: str | None = Header(None, alias="Range")
) -> Response:
    """No bearer token: <img>/<audio> tags can't send headers, so the HMAC signature is the credential.
    Byte ranges are supported so audio can be seeked."""
    check_signed(ctx, key, exp, sig)
    stored = await session.get(StoredFile, key)
    if stored is None:
        raise AppError(404, "not_found", "File not found")
    max_age = max(0, exp - int(ctx.clock.now().timestamp()))
    headers = {
        "Cache-Control": f"private, max-age={max_age}",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
    }
    data, size = stored.data, len(stored.data)
    span = _byte_range(range_, size) if range_ else None
    if span is None:
        return Response(content=data, media_type=stored.mime_type, headers=headers)
    start, end = span
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return Response(content=data[start : end + 1], status_code=206, media_type=stored.mime_type, headers=headers)
