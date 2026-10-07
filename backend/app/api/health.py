from fastapi import APIRouter

router = APIRouter()


# HEAD too: uptime monitors (e.g. UptimeRobot) check with HEAD requests.
@router.api_route("/health", methods=["GET", "HEAD"])
async def health() -> dict:
    return {"status": "ok"}
