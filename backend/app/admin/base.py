from __future__ import annotations

from collections.abc import Callable, Sequence
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any, ClassVar

from anyio import to_thread
from markupsafe import Markup
from sqladmin import ModelView, action
from sqladmin._types import _UNSET, UnsetAny
from sqlalchemy import Select, delete, event, func, inspect, select, update
from sqlalchemy.orm import Session, sessionmaker
from starlette.datastructures import URL
from starlette.requests import Request
from starlette.responses import RedirectResponse
from wtforms import StringField

from app.db.models import (
    AIConversation,
    Chat,
    Equipment,
    Exercise,
    ExerciseMuscle,
    Muscle,
    MuscleGroup,
    User,
    Workout,
    WorkoutExercise,
    WorkoutScheme,
    WorkoutSchemeExercise,
)
from app.db.session import engine
from app.services import image_service

# The admin has its own sessions, so that the hook below never runs for requests of the API
admin_session_maker = sessionmaker(bind=engine)

# Set automatically, so they're left out of the create forms
CREATED_COLUMNS = ("created_at", "since", "timestamp")

# Child rows that reach the clients through the delta sync of their parent row
ParentModel = type[Workout] | type[WorkoutScheme] | type[Exercise]
PARENT_ROWS: dict[type, tuple[ParentModel, str]] = {
    WorkoutExercise: (Workout, "workout_id"),
    WorkoutSchemeExercise: (WorkoutScheme, "workout_scheme_id"),
    ExerciseMuscle: (Exercise, "exercise_id"),
}


@event.listens_for(admin_session_maker, "before_flush")
def _set_sync_timestamps(session: Session, flush_context: Any, instances: Any) -> None:
    """
    The clients only receive changes through delta syncs on created_at, updated_at and deleted_at (and the name and
    image timestamps of chats), so changes made in the admin set them with now() like the API does.
    """
    parents: set[tuple[ParentModel, int]] = set()

    for obj in session.new:
        for column in CREATED_COLUMNS:
            if column in obj.__table__.c and getattr(obj, column) is None:
                setattr(obj, column, func.now())

    for obj in session.dirty:
        if not session.is_modified(obj):
            continue
        state = inspect(obj)
        if isinstance(obj, Chat):
            # Chats have no updated_at, renames and new images are tracked separately
            if state.attrs.name.history.has_changes():
                obj.name_updated_at = func.now()
                obj.name_updated_by = None
            if state.attrs.image_url.history.has_changes():
                obj.image_updated_at = func.now()
                obj.image_updated_by = None
        elif "updated_at" in obj.__table__.c:
            obj.updated_at = func.now()

    for obj in session.new | session.dirty | session.deleted:
        if type(obj) not in PARENT_ROWS:
            continue
        parent_model, foreign_key = PARENT_ROWS[type(obj)]
        history = inspect(obj).attrs[foreign_key].history
        # A child row moved to another parent changes both of them
        for parent_id in [getattr(obj, foreign_key), *history.deleted]:
            if parent_id is not None:
                parents.add((parent_model, parent_id))

    for parent_model, parent_id in parents:
        session.connection().execute(
            update(parent_model).where(parent_model.id == parent_id).values(updated_at=func.now())
        )


def details_url(request: Request, identity: str, pk: Any) -> URL:
    return request.url_for("admin:details", identity=identity, pk=pk)


def list_url(request: Request, identity: str, **filters: Any) -> URL:
    return request.url_for("admin:list", identity=identity).include_query_params(**filters)


# Shown next to the ID in links, e.g. "colin (5)"
NAME_COLUMNS = {
    "user": User.user_name,
    "exercise": Exercise.name,
    "muscle": Muscle.name,
    "muscle-group": MuscleGroup.name,
    "equipment": Equipment.name,
    "workout": Workout.name,
    "workout-scheme": WorkoutScheme.name,
    "chat": Chat.name,
    "ai-conversation": AIConversation.title,
}


def link_to(identity: str, empty: str = "") -> Callable[[Any, str, Request], Any]:
    """Shows an ID column as a link to the referenced row, with its name from NAME_COLUMNS if it has one."""
    def formatter(model: Any, attribute: str, request: Request) -> Any:
        value = getattr(model, attribute)
        if value is None:
            return empty
        name = getattr(request.state, "admin_names", {}).get(identity, {}).get(value)
        text = f"{name} ({value})" if name else value
        return Markup('<a href="{}">{}</a>').format(details_url(request, identity, value), text)
    formatter.link_identity = identity  # type: ignore[attr-defined]  # Read by AdminView._load_names
    return formatter


def image_preview(size: int) -> Callable[[Any, str, Request], Any]:
    """Shows an image hash column as a thumbnail that links to the full image."""
    def formatter(model: Any, attribute: str, request: Request) -> Any:
        image_hash = getattr(model, attribute)
        if not image_hash:
            return ""
        url = request.url_for("image", image_hash=image_hash)
        return Markup(
            '<a href="{url}" target="_blank"><img src="{url}" loading="lazy" '
            'style="max-width:{size}px;max-height:{size}px;border-radius:4px"></a>'
        ).format(url=url, size=size)
    return formatter


def image_list_preview(size: int, limit: int | None = None) -> Callable[[Any, str, Request], Any]:
    """Shows an image hash list column as thumbnails in their order, at most limit of them with the number of the others."""
    def formatter(model: Any, attribute: str, request: Request) -> Any:
        image_hashes = getattr(model, attribute) or []
        shown = image_hashes if limit is None else image_hashes[:limit]
        thumbnails = Markup("").join(
            Markup(
                '<a href="{url}" target="_blank"><img src="{url}" loading="lazy" '
                'style="max-width:{size}px;max-height:{size}px;border-radius:4px;margin:0 4px 4px 0"></a>'
            ).format(url=request.url_for("image", image_hash=image_hash), size=size)
            for image_hash in shown
        )
        if len(image_hashes) > len(shown):
            thumbnails += Markup('<span class="text-secondary">+{}</span>').format(len(image_hashes) - len(shown))
        return thumbnails
    return formatter


def truncate(length: int) -> Callable[[Any, str], Any]:
    def formatter(model: Any, attribute: str) -> Any:
        value = getattr(model, attribute)
        if value is None:
            return ""
        if len(value) <= length:
            return value
        return value[:length] + "…"
    return formatter


def related_links(*links: tuple[str, str, str]) -> Callable[[Any, str, Request], Any]:
    """
    Shows the ID on details pages together with links to the lists of related rows.
    Each link is (label, identity of the list, filter parameter that receives the ID).
    """
    def formatter(model: Any, attribute: str, request: Request) -> Any:
        value = getattr(model, attribute)
        anchors = Markup(" · ").join(
            Markup('<a href="{}">{}</a>').format(list_url(request, identity, **{parameter: value}), label)
            for label, identity, parameter in links
        )
        return Markup("{} &nbsp; <small>{}</small>").format(value, anchors)
    return formatter


class ValueFilter:
    """
    Filters by the exact value of a column, e.g. /workout/list?user_id=5. The filter is set through links
    (see related_links), so unlike sqladmin's ForeignKeyFilter it doesn't load every possible value into the sidebar.
    """
    has_operator = False
    default_value: UnsetAny = _UNSET  # No default, the filter only applies when its parameter is set
    template = "sqladmin/filters/lookup_filter.html"

    def __init__(self, column: Any, title: str, parameter_name: str | None = None) -> None:
        self.column = column
        self.title = title
        self.parameter_name = parameter_name or column.key

    async def lookups(self, request: Request, model: Any, run_query: Any) -> list[tuple[str, str]]:
        lookups = [("__all", "All")]
        value = request.query_params.get(self.parameter_name)
        if value and value != "__all":
            lookups.append((value, value))
        return lookups

    async def get_filtered_query(self, query: Select, value: Any, model: Any) -> Select:
        if not value or value == "__all":
            return query
        try:
            return query.filter(self.column == self.column.type.python_type(value))
        except (ValueError, NotImplementedError):
            return query.filter(self.column == value)


class NullFilter:
    """Filters by whether a timestamp column like deleted_at is set."""
    has_operator = False
    default_value: UnsetAny = _UNSET  # No default, the filter only applies when its parameter is set
    template = "sqladmin/filters/lookup_filter.html"

    def __init__(
        self, column: Any, title: str, set_label: str = "Yes", unset_label: str = "No", parameter_name: str | None = None
    ) -> None:
        self.column = column
        self.title = title
        self.parameter_name = parameter_name or f"{column.key}_set"
        self.labels = (set_label, unset_label)

    async def lookups(self, request: Request, model: Any, run_query: Any) -> list[tuple[str, str]]:
        return [("__all", "All"), ("set", self.labels[0]), ("unset", self.labels[1])]

    async def get_filtered_query(self, query: Select, value: Any, model: Any) -> Select:
        if value == "set":
            return query.filter(self.column.is_not(None))
        if value == "unset":
            return query.filter(self.column.is_(None))
        return query


class NumberListField(StringField):
    """
    Edits the set data arrays of workout exercises as comma separated numbers. sqladmin's default tag input would
    drop repeated values, which are normal for sets (e.g. 10, 10, 10 reps). An empty field stores NULL.
    """

    data: Any  # A list of numbers or None instead of StringField's text

    def __init__(self, label: Any = None, validators: Any = None, number_type: type = Decimal, **kwargs: Any) -> None:
        super().__init__(label, validators, **kwargs)
        self.number_type = number_type

    def _value(self) -> str:
        if self.raw_data:
            return self.raw_data[0]
        return ", ".join(str(value) for value in self.data) if self.data else ""

    def process_formdata(self, valuelist: list[str]) -> None:
        if not valuelist or not valuelist[0].strip():
            self.data = None
            return
        try:
            self.data = [self.number_type(part.strip()) for part in valuelist[0].split(",")]
        except (ValueError, InvalidOperation) as exc:
            self.data = None
            raise ValueError("Enter numbers separated by commas.") from exc


class StringListField(StringField):
    """
    Edits a list of short texts, like the aliases of an exercise, as comma separated values. Whitespace around the
    values, empty values and duplicates (regardless of case) are removed. An empty field stores an empty list.
    """

    data: Any  # A list of texts instead of StringField's text

    def __init__(self, label: Any = None, validators: Any = None, max_length: int = 50, **kwargs: Any) -> None:
        super().__init__(label, validators, **kwargs)
        self.max_length = max_length

    def _value(self) -> str:
        if self.raw_data:
            return self.raw_data[0]
        return ", ".join(self.data) if self.data else ""

    def process_formdata(self, valuelist: list[str]) -> None:
        values: list[str] = []
        for part in (valuelist[0] if valuelist else "").split(","):
            value = part.strip()
            if value and value.casefold() not in (existing.casefold() for existing in values):
                values.append(value)
        self.data = values
        too_long = [value for value in values if len(value) > self.max_length]
        if too_long:
            raise ValueError(f"Every value can be at most {self.max_length} characters long: {', '.join(too_long)}")


class AdminView(ModelView):
    page_size = 50
    page_size_options = [25, 50, 100, 500]
    can_export = True
    # sqladmin leaves foreign key columns out of the forms unless this is set. Since every view lists its
    # form_columns, it doesn't add the primary keys of rows with their own ID to the forms.
    form_include_pk = True

    async def list(self, request: Request) -> Any:
        pagination = await super().list(request)
        await self._load_names(request, pagination.rows, self._list_formatters)
        return pagination

    async def get_object_for_details(self, request: Request) -> Any:
        obj = await super().get_object_for_details(request)
        if obj is not None:
            await self._load_names(request, [obj], self._detail_formatters)
        return obj

    async def _load_names(self, request: Request, rows: Sequence[Any], formatters: dict[str, Any]) -> None:
        """Loads the names shown by the link_to formatters with one query per referenced table."""
        ids: dict[str, set[Any]] = {}
        for attribute, formatter in formatters.items():
            identity = getattr(formatter, "link_identity", None)
            if identity in NAME_COLUMNS:
                ids.setdefault(identity, set()).update(
                    value for row in rows if (value := getattr(row, attribute, None)) is not None
                )

        def run(session: Session) -> dict[str, dict[Any, str]]:
            names: dict[str, dict[Any, str]] = {}
            for identity, values in ids.items():
                if values:
                    column = NAME_COLUMNS[identity]
                    pk = column.class_.id
                    names[identity] = dict(session.execute(select(pk, column).where(pk.in_(values))).tuples().all())
            return names

        request.state.admin_names = await self.run_in_session(run) if ids else {}

    def run_in_session(self, function: Callable[[Session], Any]) -> Any:
        """Runs function with a new admin session in a worker thread and commits afterwards."""
        def run() -> Any:
            with self.session_maker() as session:
                result = function(session)
                session.commit()
                return result
        return to_thread.run_sync(run)

    async def for_each_selected(
        self, request: Request, function: Callable[[Session, Any], object],
        after_commit: Callable[[], RedirectResponse | None] | None = None,
    ) -> RedirectResponse:
        """
        Runs function for every row selected for an action in one transaction and redirects back.
        Errors are shown on the list page, like sqladmin does for failed deletes. after_commit only runs when the
        transaction was committed, and can return another response.
        """
        pks = [pk for pk in request.query_params.get("pks", "").split(",") if pk]

        def run(session: Session) -> None:
            for pk in pks:
                obj = session.execute(self._stmt_by_identifier(pk)).scalars().first()
                if obj is not None:
                    function(session, obj)

        try:
            await self.run_in_session(run)
        except Exception as exc:
            url = request.url_for("admin:list", identity=self.identity).include_query_params(error=str(exc))
            return RedirectResponse(url, status_code=302)
        if after_commit is not None and (response := after_commit()) is not None:
            return response
        return RedirectResponse(request.headers.get("referer") or request.url_for("admin:list", identity=self.identity), status_code=302)


if TYPE_CHECKING:
    # The mixins are only used together with AdminView, whose attributes they use
    _AdminViewBase = AdminView
else:
    _AdminViewBase = object


class SoftDeleteMixin(_AdminViewBase):
    """
    The API never deletes these rows directly but sets deleted_at, so that the deletion reaches the clients through
    the delta syncs. The delete button does the same. Soft deleted rows can be restored or deleted permanently.
    image_columns_owned lists the image hash (or hash list) columns whose files are discarded on a permanent delete.
    """
    image_columns_owned: ClassVar[tuple[str, ...]] = ()

    def soft_delete(self, session: Session, obj: Any) -> None:
        if obj.deleted_at is None:
            obj.deleted_at = func.now()

    def restore(self, session: Session, obj: Any) -> None:
        obj.deleted_at = None

    def delete_permanently(self, session: Session, obj: Any) -> None:
        if obj.deleted_at is None:
            raise ValueError("Only soft deleted rows can be deleted permanently. Delete them first.")
        for column in self.image_columns_owned:
            value = getattr(obj, column)
            for image_hash in value if isinstance(value, list) else [value]:
                image_service.discard_image(session, image_hash)
        # Deleted in SQL, so that the dependent rows are removed by the ON DELETE rules of the database
        # instead of the ORM trying to clear their foreign keys
        session.execute(delete(self.model).where(*(column == getattr(obj, column.key) for column in self.pk_columns)))

    async def delete_model(self, request: Request, pk: Any) -> None:
        def run(session: Session) -> None:
            obj = session.execute(self._stmt_by_identifier(pk)).scalars().one()
            self.soft_delete(session, obj)
        await self.run_in_session(run)

    @action("restore", "Restore", "Restore the selected rows?")
    async def restore_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, self.restore)

    @action(
        "delete-permanently", "Delete permanently",
        "Permanently delete the selected soft deleted rows? This can't be undone and removes their dependent rows too."
    )
    async def delete_permanently_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, self.delete_permanently)
