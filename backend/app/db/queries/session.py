from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_session_token
from app.db.models import Session as UserSession

# Short enough to not matter for the sliding expiration, but avoids locking the session row on every request
LAST_ACTIVE_UPDATE_INTERVAL = timedelta(minutes=1)


class SessionLifetime(NamedTuple):
    min: timedelta
    sliding: timedelta
    max: timedelta


def get_session_lifetime() -> SessionLifetime:
    """Returns the lifetime limits of a session, the same for every client ('mobile' and 'web')."""
    return SessionLifetime(
        min=timedelta(days=settings.SESSION_MIN_DAYS),
        sliding=timedelta(days=settings.SESSION_SLIDING_DAYS),
        max=timedelta(days=settings.SESSION_MAX_DAYS),
    )


def create_session(db: Session, user_id: int, raw_token: str, agent: str, ip_address: str | None) -> UserSession:
    """
    The IP address is only recorded here and may change during the session.
    """
    hashed_token = hash_session_token(raw_token)
    current_time = datetime.now(UTC)

    new_session = UserSession(
        user_id=user_id,
        session_token_hash=hashed_token,
        agent=agent,
        ip_address=ip_address,
        created_at=current_time,
        last_active_at=current_time,
    )
    db.add(new_session)
    db.flush()
    return new_session


def is_session_valid(session_record: UserSession, current_time: datetime) -> bool:
    """
    A session is valid for at least the min and at most the max lifetime.
    In between it stays valid as long as it was used within the sliding lifetime.
    """
    lifetime = get_session_lifetime()

    if current_time >= session_record.created_at + lifetime.max:
        return False
    if current_time < session_record.created_at + lifetime.min:
        return True
    return current_time < session_record.last_active_at + lifetime.sliding


def is_session_expired() -> Any:
    """
    SQL condition for the sessions that is_session_valid rejects, so they can be deleted in bulk.
    """
    lifetime = get_session_lifetime()
    now = func.now()
    return or_(
        UserSession.created_at + lifetime.max <= now,
        and_(UserSession.created_at + lifetime.min <= now, UserSession.last_active_at + lifetime.sliding <= now),
    )


def check_session_token(db: Session, raw_token: str) -> UserSession | None:
    """
    Every successful check extends the sliding expiration.
    """
    hashed_token = hash_session_token(raw_token)

    session_record = db.query(UserSession).filter(UserSession.session_token_hash == hashed_token).first()

    if not session_record:
        return None

    # Expired sessions are only rejected here. Deleting them would be rolled back anyway,
    # because the request fails with 401 afterwards.
    current_time = datetime.now(UTC)
    if not is_session_valid(session_record, current_time):
        return None

    # Only refreshed when it is outdated, since the update locks the session row until the end of the request
    # and would serialize all concurrent requests of the session (e.g. loading images in parallel).
    # Committed together with the rest of the request by get_db
    if session_record.last_active_at < current_time - LAST_ACTIVE_UPDATE_INTERVAL:
        session_record.last_active_at = current_time
        db.flush()

    return session_record


def delete_session_by_token(db: Session, raw_token: str) -> bool:
    hashed_token = hash_session_token(raw_token)

    session_record = db.query(UserSession).filter(UserSession.session_token_hash == hashed_token).first()

    if not session_record:
        return False

    db.delete(session_record)
    db.flush()

    return True

def delete_all_sessions_for_user(db: Session, user_id: int) -> int:
    deleted_count = db.query(UserSession).filter(UserSession.user_id == user_id).delete()
    db.flush()

    return deleted_count


def delete_other_sessions_for_user(db: Session, user_id: int, keep_raw_token: str | None) -> int:
    statement = db.query(UserSession).filter(UserSession.user_id == user_id)
    if keep_raw_token:
        statement = statement.filter(UserSession.session_token_hash != hash_session_token(keep_raw_token))
    deleted_count = statement.delete(synchronize_session=False)
    db.flush()

    return deleted_count
