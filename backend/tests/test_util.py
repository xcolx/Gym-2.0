from datetime import UTC, datetime, timedelta, timezone

from app.util.time import ensure_utc, to_iso


def test_ensure_utc_treats_naive_datetimes_as_utc():
    value = ensure_utc(datetime(2024, 6, 1, 18, 30))

    assert value == datetime(2024, 6, 1, 18, 30, tzinfo=UTC)
    assert value.tzinfo == UTC


def test_ensure_utc_converts_other_timezones():
    berlin_summer = timezone(timedelta(hours=2))

    value = ensure_utc(datetime(2024, 6, 1, 20, 30, tzinfo=berlin_summer))

    assert value == datetime(2024, 6, 1, 18, 30, tzinfo=UTC)
    assert value.utcoffset() == timedelta(0)


def test_to_iso():
    assert to_iso(datetime(2024, 6, 1, 18, 30)) == "2024-06-01T18:30:00+00:00"
    assert to_iso(datetime(2024, 6, 1, 20, 30, 0, 123456, tzinfo=timezone(timedelta(hours=2)))) == "2024-06-01T18:30:00.123456+00:00"
