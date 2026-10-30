"""
Counts the requests the API answers for the traffic page of the admin (app/admin/traffic.py). The counts are kept in
memory and added to the request_stats table once a minute, which works since uvicorn runs a single process. Nothing
that identifies a user is stored.
"""
import asyncio
import bisect
import logging
import re
import time
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import NamedTuple

from anyio import to_thread
from sqlalchemy import func, literal_column
from sqlalchemy.dialects.postgresql import insert
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.db.models import RequestStat
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Upper bounds of the duration buckets, a last bucket counts the slower requests
REQUEST_DURATION_BUCKETS_MS = (50, 100, 250, 500, 1000, 2500, 5000)
FLUSH_INTERVAL_SECONDS = 60
# Called every 30 seconds by the healthchecks of the containers, which would drown the real traffic
IGNORED_PATHS = ("/health",)

_API_VERSION = re.compile(r"v\d+")
STANDARD_METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}


class StatKey(NamedTuple):
    hour: datetime
    route: str
    method: str
    status: int
    api_version: str
    platform: str


@dataclass
class StatValue:
    requests: int = 0
    duration_ms_sum: int = 0
    duration_ms_max: int = 0
    duration_buckets: list[int] = field(default_factory=lambda: [0] * (len(REQUEST_DURATION_BUCKETS_MS) + 1))

    def add(self, duration_ms: int) -> None:
        self.requests += 1
        self.duration_ms_sum += duration_ms
        self.duration_ms_max = max(self.duration_ms_max, duration_ms)
        self.duration_buckets[bisect.bisect_left(REQUEST_DURATION_BUCKETS_MS, duration_ms)] += 1

    def merge(self, other: "StatValue") -> None:
        self.requests += other.requests
        self.duration_ms_sum += other.duration_ms_sum
        self.duration_ms_max = max(self.duration_ms_max, other.duration_ms_max)
        self.duration_buckets = [a + b for a, b in zip(self.duration_buckets, other.duration_buckets, strict=False)]


# Changed only on the event loop, flush swaps it for an empty one before writing in a thread
_pending: dict[StatKey, StatValue] = {}


def platform_of(user_agent: str) -> str:
    """
    The iOS app sends the default User-Agent of URLSession ("Gym%202.0/1 CFNetwork/... Darwin/..."), the web proxy
    passes on the browser's.
    """
    if "CFNetwork" in user_agent:
        return "ios"
    if user_agent.startswith("Mozilla/"):
        return "web"
    return "other"


def api_version_of(path: str, matched: bool) -> str:
    """
    The version of a matched route, or of a retired or deprecated version whose routes may be gone. Other unmatched
    paths count as "", like their routes, so made-up versions can't add rows.
    """
    segment = path.lstrip("/").split("/", 1)[0]
    if not _API_VERSION.fullmatch(segment):
        return ""
    if matched or segment in settings.RETIRED_API_VERSIONS or segment in settings.DEPRECATED_API_VERSIONS:
        return segment
    return ""


def record(scope: Scope, status: int, duration_ms: int) -> None:
    route = scope.get("route")
    method = scope["method"]
    key = StatKey(
        hour=datetime.now(UTC).replace(minute=0, second=0, microsecond=0),
        # The matched route's template, so /v1/workouts/1 and /v1/workouts/2 count together. Paths that matched no
        # route all count as "", anyone can make up any number of them.
        route=getattr(route, "path_format", "")[:255],
        # Clients can send any method, the made-up ones count together
        method=method if method in STANDARD_METHODS else "OTHER",
        status=status,
        api_version=api_version_of(scope["path"], route is not None),
        platform=platform_of(Headers(scope=scope).get("user-agent", "")),
    )
    _pending.setdefault(key, StatValue()).add(duration_ms)


class RequestStatsMiddleware:
    """Records every HTTP request of the API (the admin host is handed over before) once its response is sent."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith(IGNORED_PATHS):
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status = 500

        async def send_with_status(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
        finally:
            # Also for errors that weren't handled, which are answered with 500 outside of this middleware
            record(scope, status, round((time.perf_counter() - start) * 1000))


def _write(stats: dict[StatKey, StatValue]) -> None:
    """Adds the counts to the rows of their hours, creating the rows that don't exist yet."""
    statement = insert(RequestStat).values([
        {**key._asdict(), **value.__dict__} for key, value in stats.items()
    ])
    excluded = statement.excluded
    statement = statement.on_conflict_do_update(
        index_elements=list(StatKey._fields),
        set_={
            "requests": RequestStat.requests + excluded.requests,
            "duration_ms_sum": RequestStat.duration_ms_sum + excluded.duration_ms_sum,
            "duration_ms_max": func.greatest(RequestStat.duration_ms_max, excluded.duration_ms_max),
            # Element-wise sum of the two arrays
            "duration_buckets": literal_column(
                "ARRAY(SELECT a + b FROM unnest(request_stats.duration_buckets, excluded.duration_buckets) AS t(a, b))"
            ),
        },
    )
    with SessionLocal() as session:
        session.execute(statement)
        session.commit()


async def flush() -> None:
    """Writes the pending counts. If that fails they are kept and written with the next flush."""
    global _pending
    if not _pending:
        return
    stats, _pending = _pending, {}
    try:
        await to_thread.run_sync(_write, stats)
    except Exception:
        logger.exception("Writing %d request stats failed, trying again with the next flush.", len(stats))
        for key, value in stats.items():
            _pending.setdefault(key, StatValue()).merge(value)


async def flush_periodically() -> None:
    """Runs until it is cancelled, then writes what is left."""
    try:
        while True:
            await asyncio.sleep(FLUSH_INTERVAL_SECONDS)
            await flush()
    finally:
        with suppress(Exception):
            await asyncio.shield(flush())
