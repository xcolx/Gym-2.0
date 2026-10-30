from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NamedTuple

from anyio import to_thread
from sqlalchemy import false, func, select, true
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response
from starlette.routing import Route

from app.admin.base import admin_session_maker
from app.admin.images import ImageAwareAdmin
from app.core.config import settings
from app.db.models import Message, Report, RequestStat, User, Workout
from app.db.models import Session as UserSession
from app.services import maintenance_service

TEMPLATES_DIR = str(Path(__file__).parent / "templates")

# Users with at least this many failed logins in a row are shown on the dashboard
FAILED_LOGINS_WARNING = 5


class Action(NamedTuple):
    """A button below a stat that sends a POST request to the admin route with this name after a confirmation."""
    route: str
    label: str
    confirm: str


class Stat(NamedTuple):
    label: str
    value: int | str
    url: str | None = None
    action: Action | None = None


def megabytes(size: int) -> str:
    return f"{size / (1024 * 1024):.1f} MB"


class GymAdmin(ImageAwareAdmin):
    """The admin panel with a dashboard as its start page."""

    def __init__(self, app: Starlette, **kwargs: Any) -> None:
        super().__init__(app, session_maker=admin_session_maker, templates_dir=TEMPLATES_DIR, title="Gym 2.0 Admin", **kwargs)
        # Placed before the routes of sqladmin, whose /{identity}/... patterns would catch them otherwise
        self.admin.router.routes[:0] = [
            Route("/maintenance/remove-old-data", self.remove_old_data, methods=["POST"], name="remove_old_data"),
        ]

    async def index(self, request: Request) -> Response:
        sections = await to_thread.run_sync(self._collect_stats, request)
        return await self.templates.TemplateResponse(
            request, "dashboard.html", {"sections": sections, "message": request.query_params.get("message")}
        )

    async def remove_old_data(self, request: Request) -> Response:
        """Runs the cleanup of the daily prune job (app/jobs/prune.py) right away. Only from the admin's own pages, see SameOriginMiddleware."""

        def run() -> tuple[dict[str, int], int]:
            with self.session_maker() as session:
                result = maintenance_service.remove_old_data(session)
                session.commit()
                return result

        removed, kept_exercises = await to_thread.run_sync(run)
        message = "Removed " + ", ".join(f"{count} {label}" for label, count in removed.items()) + "."
        if kept_exercises:
            message += f" {kept_exercises} deleted exercises are kept because workouts or schemes still use them."
        return self._dashboard_with_message(request, message)

    @staticmethod
    def _dashboard_with_message(request: Request, message: str) -> Response:
        url = request.url_for("admin:index").include_query_params(message=message)
        return RedirectResponse(url, status_code=303)

    def _collect_stats(self, request: Request) -> dict[str, list[Stat]]:
        def url(identity: str, **filters) -> str:
            return str(request.url_for("admin:list", identity=identity).include_query_params(**filters))

        retention_days = maintenance_service.RETENTION.days
        unverified_days = maintenance_service.UNVERIFIED_RETENTION.days
        stats_days = maintenance_service.REQUEST_STATS_RETENTION.days
        week_ago = datetime.now(UTC) - timedelta(days=7)
        day_ago = datetime.now(UTC) - timedelta(days=1)

        with self.session_maker() as session:
            def count(statement) -> int:
                return session.scalar(select(func.count()).select_from(statement.subquery()))

            def requests_since(since: datetime, *conditions) -> int:
                return session.scalar(
                    select(func.coalesce(func.sum(RequestStat.requests), 0)).where(RequestStat.hour >= since, *conditions)
                )

            traffic_url = str(request.url_for("admin:view-traffic"))

            users = select(User.id).where(User.deleted_at.is_(None))
            active_users = select(UserSession.user_id).distinct()

            return {
                "To do": [
                    Stat("Open reports", count(select(Report.id)), url("report")),
                ],
                "Users": [
                    Stat("Users", count(users), url("user", deleted_at_set="unset")),
                    Stat("Unverified emails", count(users.where(User.active == false())), url("user", active="false", deleted_at_set="unset")),
                    Stat("Signups (7 days)", count(users.where(User.created_at >= week_ago))),
                    Stat("Active (24 hours)", count(active_users.where(UserSession.last_active_at >= day_ago))),
                    Stat("Active (7 days)", count(active_users.where(UserSession.last_active_at >= week_ago))),
                    Stat("iOS users", count(users.where(User.uses_ios == true())), url("user", uses_ios="true", deleted_at_set="unset")),
                    Stat("Web users", count(users.where(User.uses_web == true())), url("user", uses_web="true", deleted_at_set="unset")),
                    Stat("Deleted accounts", count(select(User.id).where(User.deleted_at.is_not(None))), url("user", deleted_at_set="set")),
                ],
                "Activity": [
                    Stat("Workouts (7 days)", count(select(Workout.id).where(Workout.created_at >= week_ago, Workout.deleted_at.is_(None)))),
                    Stat("Workouts in progress", count(select(Workout.id).where(Workout.in_progress == true(), Workout.deleted_at.is_(None))), url("workout", in_progress="true", deleted_at_set="unset")),
                    Stat("Messages (7 days)", count(select(Message.id).where(Message.created_at >= week_ago))),
                    Stat("Sessions", count(select(UserSession.id)), url("session")),
                ],
                "Health": [
                    Stat(
                        f"{FAILED_LOGINS_WARNING}+ failed logins in a row",
                        count(users.where(User.failed_login_attempts >= FAILED_LOGINS_WARNING)),
                        url("user", sortBy="failed_login_attempts", sort="desc"),
                    ),
                    self._image_storage_stat(),
                    Stat("API requests (24 hours)", requests_since(day_ago), traffic_url),
                    Stat("Server errors (24 hours)", requests_since(day_ago, RequestStat.status >= 500), traffic_url),
                ],
                "Maintenance": [
                    Stat(
                        f"Rows deleted more than {retention_days} days ago, accounts unverified for {unverified_days} days "
                        "and expired sessions",
                        maintenance_service.count_old_data(session),
                        action=Action(
                            "remove_old_data", "Remove old data now",
                            f"Permanently delete all rows that were deleted more than {retention_days} days ago and the "
                            f"accounts that weren't verified within {unverified_days} days, with their dependent rows and "
                            f"images, the request stats older than {stats_days} days and the expired sessions? This also "
                            "runs every day at 01:00 UTC. This can't be undone.",
                        ),
                    ),
                ],
            }

    @staticmethod
    def _image_storage_stat() -> Stat:
        root = Path(settings.IMAGE_STORAGE_PATH)
        count = size = 0
        if root.is_dir():
            for path in root.rglob("*.jpg"):
                count += 1
                size += path.stat().st_size
        return Stat(f"Images ({count} files)", megabytes(size))
