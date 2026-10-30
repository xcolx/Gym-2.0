from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import SyncTimeExpiredError
from app.util.time import ensure_utc

# The delta endpoints only accept a last sync time up to this old. Soft deleted rows are removed for good after
# maintenance_service.RETENTION (30 days), so an older client would never learn about those deletions and has to load
# everything (get_all) instead, which replaces its local data. Must stay below RETENTION.
DELTA_MAX_AGE = timedelta(days=28)


def get_sync_time(db: Session) -> datetime:
    """
    Returns the database timestamp up to which all changes are guaranteed to be visible.

    All delta-relevant timestamps (created_at, updated_at, deleted_at) are written with now(),
    which is the start time of the writing transaction. A transaction that is still running can
    therefore commit rows with a timestamp older than the current time. Taking the start of the
    oldest running transaction (which includes the current one) guarantees that such rows are
    returned by the next delta query instead of being skipped. Long-running transactions only
    cause changes to be delivered more than once.
    """
    return db.execute(text(
        "SELECT LEAST(now(), (SELECT min(xact_start) FROM pg_stat_activity WHERE datname = current_database()))"
    )).scalar_one()


def check_last_sync_time(db: Session, last_sync_time: datetime) -> datetime:
    """
    Returns the last sync time of a delta request in UTC, or raises SyncTimeExpiredError (400) if it is older than
    DELTA_MAX_AGE, measured against the database time like the sync times themselves.
    """
    last_sync_time = ensure_utc(last_sync_time)
    now = db.execute(text("SELECT now()")).scalar_one()
    if last_sync_time < now - DELTA_MAX_AGE:
        raise SyncTimeExpiredError(
            f"The last sync is more than {DELTA_MAX_AGE.days} days ago. Load all data with get_all instead."
        )
    return last_sync_time
