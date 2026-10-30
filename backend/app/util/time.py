from datetime import UTC, datetime


def ensure_utc(value: datetime) -> datetime:
    """
    Naive datetimes are interpreted as UTC.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def to_iso(value: datetime) -> str:
    """
    In UTC, e.g. "2024-06-01T18:30:00+00:00".
    """
    return ensure_utc(value).isoformat()
