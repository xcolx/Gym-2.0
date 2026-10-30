from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.cookies import SESSION_COOKIE_NAME, clear_session_cookie_headers
from app.core.errors import EmailVerificationError, UserNotFoundError
from app.db.models import User
from app.db.queries.session import check_session_token
from app.db.queries.users import get_user_by_id
from app.db.session import get_db

# The database session of a request. Use this instead of Depends(get_db) everywhere:
# - scope="function" commits before the response is sent. With the default scope the commit would only run
#   after the client already received a success response, and row locks would be held while it is sent.
# - Dependencies with a different scope are not shared, so mixing both would give one request two sessions.
DbSession = Depends(get_db, scope="function")


def get_current_user_id(request: Request, db: Session = DbSession) -> int:
    """Returns the user ID of the session in the cookie, or raises a 401."""
    token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Session cookie missing.",
        )

    active_session = check_session_token(db, raw_token=token)

    if not active_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token.",
            headers=clear_session_cookie_headers(),
        )

    return active_session.user_id


def get_current_user(
    db: Session = DbSession,
    user_id: int = Depends(get_current_user_id)
) -> User:
    user = get_user_by_id(db, user_id)

    if not user:
        raise UserNotFoundError("No user found for the given session token.")

    if user.deleted_at is not None:
        raise UserNotFoundError("Deleted user account.")

    if not user.active:
        raise EmailVerificationError("Email not verified. Please verify your email before logging in.")

    return user
