from collections.abc import Callable
from datetime import UTC, datetime
from math import ceil
from typing import NamedTuple

from anyio import to_thread
from sqladmin import BaseView, expose
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import Response

from app.admin.base import admin_session_maker
from app.core.errors import ImageNotFoundError
from app.db.models import Chat, Exercise, Message, Muscle, User
from app.services import image_service

PAGE_SIZE = 120


class Tile(NamedTuple):
    """One image of the grid with the row it belongs to."""
    image_hash: str
    date: datetime | None
    # Identity of the admin view of the row, e.g. "message"
    identity: str
    pk: int
    label: str
    deleted: bool


class Kind(NamedTuple):
    label: str
    # Admin view and action that remove the image
    identity: str
    # None for the catalog images the admins upload themselves, which get a link to the edit form instead
    remove_action: str | None
    remove_confirm: str | None
    count: Callable[[Session], int]
    # Loads one page of tiles, newest first
    page: Callable[[Session, int, int], list[Tile]]


def _file_date(image_hash: str) -> datetime | None:
    """The time the image file was written. Every upload gets a new random hash, so this is the time of the upload."""
    try:
        return datetime.fromtimestamp(image_service.get_image_path(image_hash).stat().st_mtime, UTC)
    except (ImageNotFoundError, OSError):
        return None


def _message_page(session: Session, offset: int, limit: int) -> list[Tile]:
    rows = session.execute(
        select(Message.id, Message.image_url, Message.created_at, Message.deleted_at, User.user_name)
        .outerjoin(User, User.id == Message.sender_id)
        .where(Message.image_url.is_not(None))
        .order_by(Message.created_at.desc(), Message.id.desc())
        .offset(offset).limit(limit)
    )
    return [
        Tile(image_hash, created_at, "message", pk, f"Message {pk} by {user_name or 'deleted user'}", deleted_at is not None)
        for pk, image_hash, created_at, deleted_at, user_name in rows
    ]


def _chat_page(session: Session, offset: int, limit: int) -> list[Tile]:
    # Chats created with an image have no image_updated_at
    date = func.coalesce(Chat.image_updated_at, Chat.created_at)
    rows = session.execute(
        select(Chat.id, Chat.image_url, date, Chat.deleted_at, Chat.name)
        .where(Chat.image_url.is_not(None))
        .order_by(date.desc(), Chat.id.desc())
        .offset(offset).limit(limit)
    )
    return [
        Tile(image_hash, image_date, "chat", pk, f"{name or 'Chat'} ({pk})", deleted_at is not None)
        for pk, image_hash, image_date, deleted_at, name in rows
    ]


def _newest_files(tiles: list[Tile], offset: int, limit: int) -> list[Tile]:
    """For the rows that don't store when their image changed: all of them are sorted by the time of the file."""
    oldest = datetime.min.replace(tzinfo=UTC)
    tiles.sort(key=lambda tile: (tile.date or oldest, tile.pk), reverse=True)
    return tiles[offset:offset + limit]


def _user_page(column) -> Callable[[Session, int, int], list[Tile]]:
    def page(session: Session, offset: int, limit: int) -> list[Tile]:
        rows = session.execute(select(User.id, column, User.deleted_at, User.user_name).where(column.is_not(None)))
        tiles = [
            Tile(image_hash, _file_date(image_hash), "user", pk, f"{user_name} ({pk})", deleted_at is not None)
            for pk, image_hash, deleted_at, user_name in rows
        ]
        return _newest_files(tiles, offset, limit)
    return page


def _exercise_page(session: Session, offset: int, limit: int) -> list[Tile]:
    rows = session.execute(
        select(Exercise.id, Exercise.image_urls, Exercise.deleted_at, Exercise.name).where(Exercise.image_urls != [])
    )
    tiles = [
        Tile(
            image_hash, _file_date(image_hash), "exercise", pk,
            f"{name} ({pk}), image {index} of {len(image_hashes)}", deleted_at is not None,
        )
        for pk, image_hashes, deleted_at, name in rows
        for index, image_hash in enumerate(image_hashes, 1)
    ]
    return _newest_files(tiles, offset, limit)


def _muscle_page(session: Session, offset: int, limit: int) -> list[Tile]:
    rows = session.execute(select(Muscle.id, Muscle.image_url, Muscle.name))
    tiles = [Tile(image_hash, _file_date(image_hash), "muscle", pk, f"{name} ({pk})", False) for pk, image_hash, name in rows]
    return _newest_files(tiles, offset, limit)


def _counter(column) -> Callable[[Session], int]:
    return lambda session: session.execute(select(func.count()).where(column.is_not(None))).scalar_one()


REMOVE_PROFILE_IMAGE = "Remove the profile image and icon of this user?"

KINDS = {
    "message": Kind(
        "Messages", "message", "remove-image", "Remove the image of this message?",
        _counter(Message.image_url), _message_page,
    ),
    "chat": Kind(
        "Group chats", "chat", "remove-image", "Remove the image of this group chat?",
        _counter(Chat.image_url), _chat_page,
    ),
    "profile": Kind(
        "Profile images", "user", "remove-image", REMOVE_PROFILE_IMAGE,
        _counter(User.profile_image_url), _user_page(User.profile_image_url),
    ),
    "icon": Kind(
        "Icons", "user", "remove-image", REMOVE_PROFILE_IMAGE,
        _counter(User.profile_icon_url), _user_page(User.profile_icon_url),
    ),
    "exercise": Kind(
        "Exercises", "exercise", None, None,
        lambda session: session.execute(
            select(func.coalesce(func.sum(func.cardinality(Exercise.image_urls)), 0))
        ).scalar_one(),
        _exercise_page,
    ),
    "muscle": Kind("Muscles", "muscle", None, None, _counter(Muscle.image_url), _muscle_page),
}
DEFAULT_KIND = "message"


class ImagesView(BaseView):
    """All images by type and newest first: the ones the users uploaded to moderate them, and the catalog images."""

    name = "Images"
    icon = "fa-solid fa-images"

    @expose("/images", methods=["GET"])
    async def images(self, request: Request) -> Response:
        key = request.query_params.get("type", DEFAULT_KIND)
        if key not in KINDS:
            key = DEFAULT_KIND
        kind = KINDS[key]
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1

        def run() -> tuple[dict[str, int], list[Tile]]:
            with admin_session_maker() as session:
                counts = {name: option.count(session) for name, option in KINDS.items()}
                return counts, kind.page(session, (page - 1) * PAGE_SIZE, PAGE_SIZE)

        counts, tiles = await to_thread.run_sync(run)
        return await self.templates.TemplateResponse(request, "images.html", {
            "kinds": KINDS, "kind_key": key, "kind": kind, "counts": counts, "tiles": tiles,
            "page": page, "pages": max(1, ceil(counts[key] / PAGE_SIZE)),
        })
