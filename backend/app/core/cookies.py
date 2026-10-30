from fastapi import Response

from app.core.config import settings

SESSION_COOKIE_NAME = "session_token"


def set_session_cookie(response: Response, raw_token: str, max_age_seconds: int) -> None:
    """Its lifetime matches the maximum lifetime of the database session."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax"
    )


def clear_session_cookie(response: Response) -> None:
    """The attributes must match the ones the cookie was set with."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax"
    )


def clear_session_cookie_headers() -> dict[str, str]:
    """Headers that remove the session cookie, for responses that are raised as an HTTPException."""
    response = Response()
    clear_session_cookie(response)
    return {"set-cookie": response.headers["set-cookie"]}
