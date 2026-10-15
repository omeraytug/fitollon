import asyncio

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from fitollon.auth import check_password, clear_session_cookie, require_user, set_session_cookie
from fitollon.config import Settings, get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response, settings: Settings = Depends(get_settings)) -> dict:
    if not settings.app_password or not settings.session_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "APP_PASSWORD and SESSION_SECRET must be set")
    if not check_password(body.password, settings):
        await asyncio.sleep(1)  # slow down password guessing
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong password")
    set_session_cookie(response, settings)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", dependencies=[Depends(require_user)])
def me() -> dict:
    return {"ok": True}
