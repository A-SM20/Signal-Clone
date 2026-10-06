from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.api.deps import CtxDep
from app.services.files import MIME_BY_EXT, resolve_signed

router = APIRouter(tags=["files"])


@router.get("/files/{key}")
async def download(key: str, exp: int, sig: str, ctx: CtxDep) -> FileResponse:
    """No bearer token: <img>/<audio> tags can't send headers, so the HMAC signature is the credential."""
    path = resolve_signed(ctx, key, exp, sig)
    max_age = max(0, exp - int(ctx.clock.now().timestamp()))
    return FileResponse(
        path,
        media_type=MIME_BY_EXT.get(Path(key).suffix, "application/octet-stream"),
        headers={"Cache-Control": f"private, max-age={max_age}", "X-Content-Type-Options": "nosniff"},
    )
