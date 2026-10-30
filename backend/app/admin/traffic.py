from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from anyio import to_thread
from sqladmin import BaseView, expose
from sqlalchemy import Select, func, literal, select
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import Response

from app.admin.base import admin_session_maker
from app.core.request_stats import REQUEST_DURATION_BUCKETS_MS
from app.db.models import RequestStat
from app.services.maintenance_service import REQUEST_STATS_RETENTION


class Period(NamedTuple):
    label: str
    length: timedelta
    # Width of one bar of the chart, a unit of date_trunc
    unit: str


PERIODS = {
    "24h": Period("24 hours", timedelta(hours=24), "hour"),
    "7d": Period("7 days", timedelta(days=7), "hour"),
    "30d": Period("30 days", timedelta(days=30), "day"),
    "90d": Period(f"{REQUEST_STATS_RETENTION.days} days", REQUEST_STATS_RETENTION, "day"),
}
DEFAULT_PERIOD = "24h"


class Totals(NamedTuple):
    requests: int
    client_errors: int
    server_errors: int
    rate_limited: int
    duration_ms_sum: int
    duration_ms_max: int

    def share(self, count: int) -> str:
        return f"{count / self.requests:.1%}" if self.requests else "–"

    @property
    def average_ms(self) -> str:
        return f"{self.duration_ms_sum / self.requests:.0f} ms" if self.requests else "–"


class Row(NamedTuple):
    """One line of a table: a route, API version, platform or status with its numbers."""
    label: str
    totals: Totals
    p95: str = "–"
    last_seen: datetime | None = None


class Bar(NamedTuple):
    start: datetime
    ok: int
    client_errors: int
    server_errors: int

    @property
    def total(self) -> int:
        return self.ok + self.client_errors + self.server_errors


def percentile_label(buckets: list[int], percentile: float = 0.95) -> str:
    """The upper bound of the duration bucket the percentile falls into, e.g. "≤ 250 ms"."""
    total = sum(buckets)
    if not total:
        return "–"
    seen = 0
    for bound, count in zip(REQUEST_DURATION_BUCKETS_MS, buckets, strict=False):
        seen += count
        if seen >= total * percentile:
            return f"≤ {bound} ms"
    return f"> {REQUEST_DURATION_BUCKETS_MS[-1]} ms"


def _totals_columns() -> list:
    requests = RequestStat.requests
    return [
        func.coalesce(func.sum(requests), 0),
        func.coalesce(func.sum(requests).filter(RequestStat.status.between(400, 499)), 0),
        func.coalesce(func.sum(requests).filter(RequestStat.status >= 500), 0),
        func.coalesce(func.sum(requests).filter(RequestStat.status == 429), 0),
        func.coalesce(func.sum(RequestStat.duration_ms_sum), 0),
        func.coalesce(func.max(RequestStat.duration_ms_max), 0),
    ]


def _totals(values) -> Totals:
    return Totals(*(int(value) for value in values))


def collect(session: Session, period: Period, now: datetime) -> dict:
    """All numbers of the traffic page for the period that ends now."""
    # Whole hours, so the first bar isn't cut off
    since = now.replace(minute=0, second=0, microsecond=0) - period.length + timedelta(hours=1)
    in_period = RequestStat.hour >= since

    def grouped(*columns) -> Select:
        return select(*columns, *_totals_columns()).where(in_period).group_by(*columns)

    # Requests per duration bucket and endpoint, the buckets are an array in every row
    bucket = func.unnest(RequestStat.duration_buckets).table_valued("count", with_ordinality="index").render_derived()
    buckets: dict[tuple[str, str], list[int]] = {}
    for route, method, index, count in session.execute(
        select(RequestStat.route, RequestStat.method, bucket.c.index, func.sum(bucket.c.count))
        .select_from(RequestStat).join(bucket, literal(True))
        .where(in_period)
        .group_by(RequestStat.route, RequestStat.method, bucket.c.index)
    ):
        buckets.setdefault((route, method), [0] * (len(REQUEST_DURATION_BUCKETS_MS) + 1))[index - 1] = int(count)
    all_buckets = [sum(column) for column in zip(*buckets.values(), strict=False)]

    endpoints = [
        Row(f"{method} {route or '(no matching route)'}", _totals(values), percentile_label(buckets.get((route, method), [])))
        for route, method, *values in session.execute(grouped(RequestStat.route, RequestStat.method))
    ]
    endpoints.sort(key=lambda row: row.totals.requests, reverse=True)

    # The last request of every version within all stored stats, so a deprecated version can be retired once it's unused
    versions = [
        Row(version or "(none)", _totals(values), last_seen=last_seen)
        for version, last_seen, *values in session.execute(
            select(RequestStat.api_version, func.max(RequestStat.hour), *_totals_columns())
            .group_by(RequestStat.api_version)
        )
    ]
    versions.sort(key=lambda row: row.last_seen or datetime.min.replace(tzinfo=UTC), reverse=True)

    platforms = sorted(
        (Row(platform, _totals(values)) for platform, *values in session.execute(grouped(RequestStat.platform))),
        key=lambda row: row.totals.requests, reverse=True,
    )
    statuses = sorted(
        (Row(str(status), _totals(values)) for status, *values in session.execute(grouped(RequestStat.status))),
        key=lambda row: row.label,
    )

    slot = func.date_trunc(period.unit, RequestStat.hour, "UTC")
    counted = {
        start.astimezone(UTC): Bar(start, *(int(value) for value in values))
        for start, *values in session.execute(
            select(
                slot,
                # A slot without requests of a kind sums to NULL
                func.coalesce(func.sum(RequestStat.requests).filter(RequestStat.status < 400), 0),
                func.coalesce(func.sum(RequestStat.requests).filter(RequestStat.status.between(400, 499)), 0),
                func.coalesce(func.sum(RequestStat.requests).filter(RequestStat.status >= 500), 0),
            ).where(in_period).group_by(slot)
        )
    }
    # One bar per hour or day, also for the ones without requests
    step = timedelta(hours=1) if period.unit == "hour" else timedelta(days=1)
    start = since if period.unit == "hour" else since.replace(hour=0)
    bars = []
    while start <= now:
        bars.append(counted.get(start, Bar(start, 0, 0, 0)))
        start += step

    totals = _totals(session.execute(select(*_totals_columns()).where(in_period)).one())
    return {
        "totals": totals,
        "p95": percentile_label(all_buckets),
        "endpoints": endpoints,
        "versions": versions,
        "platforms": platforms,
        "statuses": statuses,
        "bars": bars,
        "bar_max": max((bar.total for bar in bars), default=0),
        "unit": period.unit,
    }


class TrafficView(BaseView):
    """The requests the API answered (app/core/request_stats.py), by endpoint, API version, platform and status."""

    name = "Traffic"
    icon = "fa-solid fa-chart-line"

    @expose("/traffic", methods=["GET"])
    async def traffic(self, request: Request) -> Response:
        key = request.query_params.get("period", DEFAULT_PERIOD)
        if key not in PERIODS:
            key = DEFAULT_PERIOD

        def run() -> dict:
            with admin_session_maker() as session:
                return collect(session, PERIODS[key], datetime.now(UTC))

        data = await to_thread.run_sync(run)
        return await self.templates.TemplateResponse(
            request, "traffic.html", {"periods": PERIODS, "period": key, "duration_buckets": REQUEST_DURATION_BUCKETS_MS, **data}
        )
