import hmac
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, Header, HTTPException, Request, Response, status

from fitollon.config import Settings, get_settings

COOKIE_NAME = "fitollon_session"
SESSION_DAYS = 30


def check_password(candidate: str, settings: Settings) -> bool:
    if not settings.app_password:
        return False
    return hmac.compare_digest(candidate.encode(), settings.app_password.encode())


def set_session_cookie(response: Response, settings: Settings) -> None:
    expires = datetime.now(UTC) + timedelta(days=SESSION_DAYS)
    token = jwt.encode({"sub": "owner", "exp": expires}, settings.session_secret, algorithm="HS256")
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def require_user(request: Request, settings: Settings = Depends(get_settings)) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token or not settings.session_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    try:
        claims = jwt.decode(token, settings.session_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired") from None
    return claims["sub"]


def require_ingest_token(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    supplied = x_api_key or ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    if not settings.ingest_token or not hmac.compare_digest(supplied.encode(), settings.ingest_token.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid ingest token")
