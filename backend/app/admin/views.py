from datetime import datetime
from difflib import SequenceMatcher
from typing import Any

from sqladmin import action
from sqladmin.filters import BooleanFilter, ForeignKeyFilter
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

import app.db.queries.chat as chat_crud
import app.db.queries.session as crud_session
from app.admin.base import (
    AdminView,
    NullFilter,
    NumberListField,
    SoftDeleteMixin,
    StringListField,
    ValueFilter,
    details_url,
    image_list_preview,
    image_preview,
    link_to,
    related_links,
    truncate,
)
from app.admin.images import ImageFileField, ImageListFileField, ImagePreset, ImageUploadMixin
from app.db.models import (
    AIConversation,
    AIMessage,
    BlockedUser,
    Chat,
    ChatUser,
    Equipment,
    Exercise,
    ExerciseMuscle,
    Friend,
    FriendRequest,
    Message,
    Muscle,
    MuscleGroup,
    Report,
    User,
    Workout,
    WorkoutExercise,
    WorkoutScheme,
    WorkoutSchemeExercise,
)
from app.db.models import Session as UserSession
from app.services import auth_service, chat_service, image_service, mail_service, user_service
from app.services.chat_service import CHAT_IMAGE_MAX_DIMENSION, CHAT_IMAGE_QUALITY
from app.services.exercise_service import EXERCISE_IMAGE_MAX_DIMENSION, EXERCISE_IMAGE_QUALITY, MAX_EXERCISE_IMAGES

MUSCLE_IMAGE_PRESET = ImagePreset(quality=90, max_dimension=1024)
EXERCISE_IMAGE_PRESET = ImagePreset(quality=EXERCISE_IMAGE_QUALITY, max_dimension=EXERCISE_IMAGE_MAX_DIMENSION)
CHAT_IMAGE_PRESET = ImagePreset(quality=CHAT_IMAGE_QUALITY, max_dimension=CHAT_IMAGE_MAX_DIMENSION)

# Timestamps the admin sets itself (see app.admin.base), so they are left out of the forms
SYNC_COLUMNS = ["created_at", "updated_at", "deleted_at"]

METRICS = ["reps", "weights", "time", "intensity", "distance"]


def _tracked_metrics(exercise: Any) -> list[str]:
    """The metrics an exercise (or a row with its metric columns) tracks, in the order of METRICS."""
    return [metric for metric in METRICS if getattr(exercise, metric)]


def _name_similarity(a: str, b: str) -> float:
    """0 to 1, ignoring case, a name that contains the other one (e.g. Curl and Bicep Curl) counts as similar."""
    a, b = a.casefold().strip(), b.casefold().strip()
    if a and b and (a in b or b in a):
        return max(0.8, SequenceMatcher(None, a, b).ratio())
    return SequenceMatcher(None, a, b).ratio()


class EquipmentAdmin(AdminView, model=Equipment):
    name_plural = "Equipment"
    category = "Exercise Catalog"
    column_list = ["id", "name"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "name"]
    column_details_list = ["id", "name"]
    column_formatters_detail = {"id": related_links(("Exercises", "exercise", "equipment_id"))}
    form_columns = ["name"]


class MuscleGroupAdmin(AdminView, model=MuscleGroup):
    category = "Exercise Catalog"
    column_list = ["id", "name"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "name"]
    column_details_list = ["id", "name"]
    column_formatters_detail = {"id": related_links(("Exercises", "exercise", "muscle_group_id"))}
    form_columns = ["name"]


class MuscleAdmin(ImageUploadMixin, AdminView, model=Muscle):
    category = "Exercise Catalog"
    column_list = ["id", "image_url", "name"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "name"]
    column_labels = {"image_url": "Image"}
    column_formatters = {"image_url": image_preview(48)}
    column_formatters_detail = {
        "id": related_links(("Exercises", "exercise-muscle", "muscle_id")),
        "image_url": image_preview(300),
    }
    form_columns = ["name", "image_url"]
    form_overrides = {"image_url": ImageFileField}
    image_columns = {"image_url": MUSCLE_IMAGE_PRESET}


class ExerciseAdmin(SoftDeleteMixin, ImageUploadMixin, AdminView, model=Exercise):
    """
    Verified exercises are visible to every user, unverified ones only to the user who created them.
    Created exercises are verified catalog exercises unless the checkbox is cleared.
    """
    category = "Exercise Catalog"
    column_list = ["id", "image_urls", "name", "verified", "muscle_group_id", "equipment_id", "user_id", "created_at", "deleted_at"]
    column_searchable_list = ["name", "description"]
    column_sortable_list = ["id", "name", "verified", "muscle_group_id", "equipment_id", "user_id", "created_at", "updated_at", "deleted_at"]
    column_default_sort = ("id", True)
    column_filters = [
        BooleanFilter(Exercise.verified),
        ForeignKeyFilter(Exercise.muscle_group_id, MuscleGroup.name, title="Muscle Group"),
        ForeignKeyFilter(Exercise.equipment_id, Equipment.name, title="Equipment"),
        NullFilter(Exercise.user_id, "Created By", set_label="A user", unset_label="Admin"),
        NullFilter(Exercise.deleted_at, "Deleted"),
        ValueFilter(Exercise.user_id, "User ID"),
        ValueFilter(Exercise.muscle_group_id, "Muscle Group ID"),
        ValueFilter(Exercise.equipment_id, "Equipment ID"),
    ]
    column_labels = {"image_urls": "Images", "muscle_group_id": "Muscle group", "equipment_id": "Equipment", "user_id": "Created by"}
    column_formatters = {
        "image_urls": image_list_preview(40, limit=1),
        "muscle_group_id": link_to("muscle-group"),
        "equipment_id": link_to("equipment"),
        "user_id": link_to("user"),
    }
    column_formatters_detail = {
        "id": related_links(
            ("Used in workouts", "workout-exercise", "exercise_id"),
            ("Used in schemes", "workout-scheme-exercise", "exercise_id"),
        ),
        "image_urls": image_list_preview(300),
        "muscle_group_id": link_to("muscle-group"),
        "equipment_id": link_to("equipment"),
        "user_id": link_to("user"),
    }
    column_details_exclude_list = ["exercise_muscles"]
    column_export_exclude_list = ["exercise_muscles"]
    form_columns = [
        "name", "aliases", "description", "image_urls", "muscle_group_id", "equipment_id", "verified", "user_id",
        "reps", "weights", "time", "intensity", "distance"
    ]
    form_args = {
        "verified": {"default": True},
        "user_id": {"description": "Creator of a user made exercise. Empty for catalog exercises."},
        "aliases": {"description": "Other names, separated by commas. The apps only use them for the search, they are not shown."},
        "image_urls": {"description": f"Up to {MAX_EXERCISE_IMAGES} images, e.g. one per keyframe of the movement, shown in the order they are chosen."},
    }
    form_overrides = {"image_urls": ImageListFileField, "aliases": StringListField}
    image_list_columns = {"image_urls": EXERCISE_IMAGE_PRESET}
    max_list_images = MAX_EXERCISE_IMAGES
    image_columns_owned = ("image_urls",)
    details_template = "exercise_details.html"

    async def get_object_for_details(self, request: Request) -> Any:
        """Also loads the muscles of the exercise, which exercise_details.html shows below the columns."""
        exercise = await super().get_object_for_details(request)
        if exercise is not None:
            statement = (
                select(Muscle.id, Muscle.name, Muscle.image_url, ExerciseMuscle.is_primary)
                .join(ExerciseMuscle, ExerciseMuscle.muscle_id == Muscle.id)
                .where(ExerciseMuscle.exercise_id == exercise.id)
                .order_by(ExerciseMuscle.is_primary.desc(), Muscle.name)
            )
            request.state.exercise_muscles = await self.run_in_session(lambda session: session.execute(statement).all())
        return exercise

    def _set_verified(self, verified: bool) -> Any:
        def run(session: Session, exercise: Exercise) -> None:
            exercise.verified = verified
        return run

    @action("verify", "Verify", "Verify the selected exercises? They become visible to every user.")
    async def verify_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, self._set_verified(True))

    @action(
        "unverify", "Unverify",
        "Unverify the selected exercises? Only their creators will receive them from now on. "
        "Clients of other users that already synced them keep them."
    )
    async def unverify_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, self._set_verified(False))

    @action("merge", "Merge into…")
    async def merge_action(self, request: Request) -> Response:
        """
        Replaces the selected duplicate exercises with another exercise in all workouts and schemes and deletes them.
        The first request shows a form that asks for the exercise to keep, which sends the ID back as ?into=.
        """
        pks = [int(pk) for pk in request.query_params.get("pks", "").split(",") if pk.isdigit()]
        into = request.query_params.get("into", "").strip()
        error = None

        if into and not into.isdigit():
            error = "Enter the ID of an exercise."
        elif into:
            try:
                await self.run_in_session(lambda session: self._merge(session, pks, int(into)))
                return RedirectResponse(request.url_for("admin:details", identity=self.identity, pk=into), status_code=302)
            except ValueError as exc:
                error = str(exc)

        def load(session: Session) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
            workouts = select(func.count()).where(WorkoutExercise.exercise_id == Exercise.id).scalar_subquery()
            schemes = select(func.count()).where(WorkoutSchemeExercise.exercise_id == Exercise.id).scalar_subquery()
            statement = select(
                Exercise.id, Exercise.name, Exercise.user_id, Exercise.verified, Exercise.deleted_at,
                *(getattr(Exercise, metric) for metric in METRICS),
                workouts.label("workouts"), schemes.label("schemes"),
            )
            rows = session.execute(statement.where(Exercise.id.in_(pks)).order_by(Exercise.id)).all()
            exercises = [{**row._asdict(), "metrics": ", ".join(_tracked_metrics(row))} for row in rows]
            return exercises, self._similar_exercises(session, exercises)

        exercises, similar = await self.run_in_session(load)
        return await self.templates.TemplateResponse(
            request, "exercise_merge.html",
            {
                "model_view": self, "exercises": exercises, "similar": similar,
                "pks": ",".join(map(str, pks)), "into": into, "error": error,
            },
        )

    @staticmethod
    def _similar_exercises(session: Session, exercises: list[dict[str, Any]], limit: int = 15) -> list[dict[str, Any]]:
        """
        The verified exercises whose name or one of whose aliases is similar to the name of a selected exercise, the
        most similar first, as candidates to merge into. The catalog is small enough to compare all names in Python.
        """
        names = [exercise["name"] for exercise in exercises]
        selected = {exercise["id"] for exercise in exercises}
        candidates = session.scalars(select(Exercise).where(Exercise.verified, Exercise.deleted_at.is_(None))).all()
        scored = []
        for candidate in candidates:
            if candidate.id in selected:
                continue
            score = max(
                (_name_similarity(name, other) for name in names for other in [candidate.name, *candidate.aliases]),
                default=0,
            )
            if score >= 0.6:
                scored.append((score, candidate))
        scored.sort(key=lambda item: (-item[0], item[1].name))
        return [
            {"id": candidate.id, "name": candidate.name, "metrics": ", ".join(_tracked_metrics(candidate))}
            for _, candidate in scored[:limit]
        ]

    @staticmethod
    def _merge(session: Session, pks: list[int], target_id: int) -> None:
        """
        Moving the rows through the ORM makes the hook in app.admin.base mark the changed workouts and schemes
        as updated, so the clients receive them with the new exercise in their next sync.
        """
        target = session.get(Exercise, target_id)
        if target is None or target.deleted_at is not None:
            raise ValueError(f"Exercise {target_id} doesn't exist or is deleted.")
        if not pks:
            raise ValueError("Select the exercises to merge first.")
        if target_id in pks:
            raise ValueError("An exercise can't be merged into itself.")

        for exercise in session.scalars(select(Exercise).where(Exercise.id.in_(pks))):
            # The users of the workouts must be able to see the exercise that replaces this one
            if not target.verified and target.user_id != exercise.user_id:
                raise ValueError(f"Exercise {target_id} is unverified and belongs to another user than exercise {exercise.id}. Verify it first.")
            # The set data of the workouts depends on the tracked metrics, like in exercise_service.update_exercise
            if _tracked_metrics(target) != _tracked_metrics(exercise):
                raise ValueError(
                    f"Exercise {exercise.id} tracks {', '.join(_tracked_metrics(exercise))}, but exercise {target_id} "
                    f"tracks {', '.join(_tracked_metrics(target))}. Only exercises with the same metrics can be merged."
                )
            for row in session.scalars(select(WorkoutExercise).where(WorkoutExercise.exercise_id == exercise.id)):
                row.exercise_id = target_id
            for scheme_row in session.scalars(select(WorkoutSchemeExercise).where(WorkoutSchemeExercise.exercise_id == exercise.id)):
                scheme_row.exercise_id = target_id
            if exercise.deleted_at is None:
                exercise.deleted_at = func.now()


class ExerciseMuscleAdmin(AdminView, model=ExerciseMuscle):
    """Changes are delivered to the clients as an update of the exercise."""
    name = "Exercise muscle"
    category = "Exercise Catalog"
    column_list = ["exercise_id", "muscle_id", "is_primary"]
    column_sortable_list = ["exercise_id", "muscle_id", "is_primary"]
    column_details_list = ["exercise_id", "muscle_id", "is_primary"]
    column_filters = [BooleanFilter(ExerciseMuscle.is_primary), ValueFilter(ExerciseMuscle.exercise_id, "Exercise ID"), ValueFilter(ExerciseMuscle.muscle_id, "Muscle ID")]
    column_formatters = {"exercise_id": link_to("exercise"), "muscle_id": link_to("muscle")}
    column_formatters_detail = column_formatters
    form_columns = ["exercise_id", "muscle_id", "is_primary"]


class UserAdmin(SoftDeleteMixin, AdminView, model=User):
    """
    Users are created through the signup only. The delete button deletes the account like the user would (soft delete,
    logout everywhere, images discarded, sent messages deleted, which a restore doesn't bring back). The prune job
    removes the account 30 days later. "active" means that the email is verified.
    """
    category = "Users & Social"
    can_create = False
    column_list = ["id", "profile_icon_url", "user_name", "email", "active", "uses_ios", "uses_web", "last_login", "failed_login_attempts", "created_at", "deleted_at"]
    column_searchable_list = ["user_name", "email", "email_change"]
    column_sortable_list = ["id", "user_name", "email", "active", "last_login", "created_at", "deleted_at", "failed_login_attempts"]
    column_default_sort = ("id", True)
    column_filters = [
        BooleanFilter(User.active, title="Email verified"),
        BooleanFilter(User.uses_ios, title="Uses iOS"),
        BooleanFilter(User.uses_web, title="Uses web"),
        NullFilter(User.oauth_provider, "Login", set_label="OAuth", unset_label="Password"),
        NullFilter(User.deleted_at, "Deleted"),
    ]
    column_labels = {"profile_icon_url": "Icon", "profile_image_url": "Profile image", "active": "Email verified", "email_change": "Pending new email"}
    column_formatters = {"profile_icon_url": image_preview(32)}
    column_details_exclude_list = ["pw_hash", "pw_reset_token", "email_verify_token", "workouts"]
    column_export_exclude_list = ["pw_hash", "pw_reset_token", "email_verify_token", "workouts"]
    column_formatters_detail = {
        "id": related_links(
            ("Workouts", "workout", "user_id"),
            ("Schemes", "workout-scheme", "user_id"),
            ("Exercises", "exercise", "user_id"),
            ("Sessions", "session", "user_id"),
            ("Chats", "chat-user", "user_id"),
            ("Messages", "message", "sender_id"),
            ("AI conversations", "ai-conversation", "user_id"),
            ("Friends", "friend", "user_id"),
            ("Friend requests", "friend-request", "user_id"),
            ("Blocks", "blocked-user", "user_id"),
            ("Blocked by", "blocked-user", "blocked_id"),
            ("Reports sent", "report", "reporter_id"),
            ("Reported", "report", "reported_user_id"),
            ("Uploads reported by NudeNet", "report", "uploader_id"),
        ),
        "profile_image_url": image_preview(300),
        "profile_icon_url": image_preview(64),
    }
    form_columns = [
        "user_name", "email", "email_change", "active", "bodyweight", "scheme_color", "weight_unit", "distance_unit",
        "language", "uses_ios", "uses_web", "failed_login_attempts", "created_at"
    ]
    form_args = {"active": {"label": "Email verified"}, "email_change": {"label": "Pending new email"}}

    def soft_delete(self, session: Session, obj: User) -> None:
        if obj.deleted_at is None:
            user_service.delete_user_account(session, obj)

    def restore(self, session: Session, obj: User) -> None:
        obj.deleted_at = None
        # The images were discarded with the deletion (the deleted messages, direct chats and left groups aren't restored either)
        obj.profile_image_url = None
        obj.profile_icon_url = None

    def delete_permanently(self, session: Session, obj: User) -> None:
        # The reports of the user go with it (ON DELETE CASCADE), their image copies with them
        reports = session.scalars(select(Report).where(Report.reporter_id == obj.id)).all()
        for report in reports:
            for image_hash in (report.profile_image, report.chat_image, report.message_image):
                image_service.discard_image(session, image_hash)
        super().delete_permanently(session, obj)

    @action("logout", "Log out everywhere", "Log the selected users out on all devices?")
    async def logout_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, lambda session, user: crud_session.delete_all_sessions_for_user(session, user.id))

    @action("verify-email", "Mark email verified", "Mark the emails of the selected users as verified (a pending email change is applied)?")
    async def verify_email_action(self, request: Request) -> RedirectResponse:
        return await self.for_each_selected(request, auth_service.mark_email_verified)

    @action("send-verification", "Send verification email", "Send a new verification email to the selected unverified users or pending email changes?")
    async def send_verification_action(self, request: Request) -> RedirectResponse:
        emails: list[tuple[str, int, str, datetime, mail_service.VerificationReason]] = []

        def run(session: Session, user: User) -> None:
            if (user.active and not user.email_change) or not user.email or user.deleted_at is not None:
                raise ValueError(f"User {user.id} has no unverified email.")
            token = auth_service.issue_email_verification(user)
            assert user.email_verify_expire is not None  # Set with the token
            emails.append((
                auth_service.verification_address(user), user.id, token, user.email_verify_expire,
                mail_service.verification_reason(user)
            ))

        def send() -> RedirectResponse | None:
            # Sent after the commit, so that the links in the emails are valid
            failed = [email[1] for email in emails if not mail_service.send_verification_email(*email)]
            if not failed:
                return None
            url = request.url_for("admin:list", identity=self.identity).include_query_params(
                error=f"The verification email could not be sent to the users {failed}."
            )
            return RedirectResponse(url, status_code=302)

        return await self.for_each_selected(request, run, after_commit=send)

    @action("remove-image", "Remove profile image", "Remove the profile images of the selected users?")
    async def remove_image_action(self, request: Request) -> RedirectResponse:
        def run(session: Session, user: User) -> None:
            image_service.discard_image(session, user.profile_image_url)
            image_service.discard_image(session, user.profile_icon_url)
            user.profile_image_url = None
            user.profile_icon_url = None
        return await self.for_each_selected(request, run)


class FriendAdmin(AdminView, model=Friend):
    """Each friendship is stored once with user_id_1 < user_id_2."""
    category = "Users & Social"
    can_edit = False
    column_list = ["user_id_1", "user_id_2", "since"]
    column_sortable_list = ["user_id_1", "user_id_2", "since"]
    column_details_list = ["user_id_1", "user_id_2", "since"]
    column_default_sort = ("since", True)
    column_filters = [ValueFilter(Friend.user_id_1, "User 1 ID"), ValueFilter(Friend.user_id_2, "User 2 ID")]
    column_formatters = {"user_id_1": link_to("user"), "user_id_2": link_to("user")}
    column_formatters_detail = column_formatters
    form_columns = ["user_id_1", "user_id_2"]

    def list_query(self, request: Request) -> Select:
        # ?user_id= shows the friendships of a user on either side
        statement = select(Friend)
        user_id = request.query_params.get("user_id", "")
        if user_id.isdigit():
            statement = statement.where((Friend.user_id_1 == int(user_id)) | (Friend.user_id_2 == int(user_id)))
        return statement

    async def on_model_change(self, data: dict, model: Any, is_created: bool, request: Request) -> None:
        if is_created and data.get("user_id_1") and data.get("user_id_2"):
            data["user_id_1"], data["user_id_2"] = sorted((int(data["user_id_1"]), int(data["user_id_2"])))
            if data["user_id_1"] == data["user_id_2"]:
                raise ValueError("Users can't be friends with themselves.")


class FriendRequestAdmin(AdminView, model=FriendRequest):
    """accepted is empty while the request is pending."""
    category = "Users & Social"
    can_create = False
    column_list = ["sender_id", "receiver_id", "timestamp", "accepted"]
    column_sortable_list = ["sender_id", "receiver_id", "timestamp", "accepted"]
    column_details_list = ["sender_id", "receiver_id", "timestamp", "accepted"]
    column_default_sort = ("timestamp", True)
    column_filters = [NullFilter(FriendRequest.accepted, "Answered"), ValueFilter(FriendRequest.sender_id, "Sender ID"), ValueFilter(FriendRequest.receiver_id, "Receiver ID")]
    column_formatters = {"sender_id": link_to("user"), "receiver_id": link_to("user")}
    column_formatters_detail = column_formatters
    form_columns = ["accepted"]

    def list_query(self, request: Request) -> Select:
        # ?user_id= shows the sent and received requests of a user
        statement = select(FriendRequest)
        user_id = request.query_params.get("user_id", "")
        if user_id.isdigit():
            statement = statement.where((FriendRequest.sender_id == int(user_id)) | (FriendRequest.receiver_id == int(user_id)))
        return statement


class BlockedUserAdmin(AdminView, model=BlockedUser):
    """Blocks. Deleting a row unblocks the user."""
    name = "Block"
    category = "Users & Social"
    can_create = False
    can_edit = False
    column_list = ["user_id", "blocked_id", "since"]
    column_sortable_list = ["user_id", "blocked_id", "since"]
    column_details_list = ["user_id", "blocked_id", "since"]
    column_default_sort = ("since", True)
    column_filters = [ValueFilter(BlockedUser.user_id, "User ID"), ValueFilter(BlockedUser.blocked_id, "Blocked ID")]
    column_labels = {"user_id": "Blocked by", "blocked_id": "Blocked user"}
    column_formatters = {"user_id": link_to("user"), "blocked_id": link_to("user")}
    column_formatters_detail = column_formatters


class ReportAdmin(AdminView, model=Report):
    """
    Reports of users, group chats and messages, to review within 24 hours (terms of use, section 4). Every row is an
    open report: handle it (delete the message, remove the image, delete the user, ...) and then delete the report.
    The report keeps a copy of the reported name, text and images, also after the original was deleted (the reference
    is empty then). Deleting the report removes its image copies.
    NudeNet reports the uploaded images it blocked or flagged by itself (core.nudity_filter): the reporter shows
    "NudeNet", the uploader is the user who uploaded it. A blocked upload's message or group was never created, the
    report only has its copy.
    """
    category = "Users & Social"
    can_create = False
    can_edit = False
    column_list = [
        "id", "reporter_id", "uploader_id", "reported_user_id", "reported_chat_id", "reported_message_id", "reason",
        "profile_image", "chat_image", "message_image", "user_name", "chat_name", "message_text", "created_at",
    ]
    column_sortable_list = ["id", "reporter_id", "reported_user_id", "reported_chat_id", "reported_message_id", "created_at"]
    column_details_list = column_list
    column_searchable_list = ["reason"]
    column_default_sort = ("created_at", False)
    column_filters = [
        NullFilter(Report.reporter_id, "Reported by", set_label="Users", unset_label="NudeNet"),
        NullFilter(Report.reported_user_id, "User reported"),
        NullFilter(Report.reported_chat_id, "Chat reported"),
        NullFilter(Report.reported_message_id, "Message reported"),
        ValueFilter(Report.reporter_id, "Reporter ID"),
        ValueFilter(Report.uploader_id, "Uploader ID"),
        ValueFilter(Report.reported_user_id, "Reported user ID"),
        ValueFilter(Report.reported_chat_id, "Reported chat ID"),
        ValueFilter(Report.reported_message_id, "Reported message ID"),
    ]
    column_labels = {
        "reporter_id": "Reporter", "uploader_id": "Uploader", "reported_user_id": "User", "reported_chat_id": "Chat",
        "reported_message_id": "Message",
        "user_name": "Username (copy)", "profile_image": "Profile image (copy)", "chat_name": "Group name (copy)",
        "chat_image": "Group image (copy)", "message_text": "Message text (copy)", "message_image": "Message photo (copy)",
    }
    column_formatters = {
        "reporter_id": link_to("user", empty="NudeNet"), "uploader_id": link_to("user"),
        "reported_user_id": link_to("user"), "reported_chat_id": link_to("chat"), "reported_message_id": link_to("message"), "reason": truncate(80), "message_text": truncate(80),
        "profile_image": image_preview(40), "chat_image": image_preview(40), "message_image": image_preview(40),
    }
    column_formatters_detail = {
        **{key: value for key, value in column_formatters.items() if key not in ("reason", "message_text")},
        "profile_image": image_preview(320), "chat_image": image_preview(320), "message_image": image_preview(320),
    }

    @action("show-next", "Show next", add_in_list=False)
    async def show_next_action(self, request: Request) -> RedirectResponse:
        """Opens the report after this one in the list's order (oldest first), or the list after the last report."""
        pk = request.query_params.get("pks", "")

        def run(session: Session) -> int | None:
            current = session.get(Report, int(pk)) if pk.isdigit() else None
            if current is None:
                return None
            later = (Report.created_at > current.created_at) | ((Report.created_at == current.created_at) & (Report.id > current.id))
            return session.scalar(select(Report.id).where(later).order_by(Report.created_at, Report.id).limit(1))

        next_pk = await self.run_in_session(run)
        if next_pk is None:
            return RedirectResponse(request.url_for("admin:list", identity=self.identity), status_code=302)
        return RedirectResponse(details_url(request, self.identity, next_pk), status_code=302)

    async def delete_model(self, request: Request, pk: Any) -> None:
        def run(session: Session) -> None:
            report = session.get(Report, int(pk))
            if report is not None:
                for image_hash in (report.profile_image, report.chat_image, report.message_image):
                    image_service.discard_image(session, image_hash)
                session.delete(report)
        await self.run_in_session(run)


class WorkoutAdmin(SoftDeleteMixin, AdminView, model=Workout):
    category = "Workouts"
    can_create = False
    column_list = ["id", "user_id", "name", "date", "duration", "in_progress", "created_at", "deleted_at"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "user_id", "name", "date", "duration", "in_progress", "created_at", "updated_at", "deleted_at"]
    column_default_sort = ("id", True)
    column_filters = [BooleanFilter(Workout.in_progress), NullFilter(Workout.deleted_at, "Deleted"), ValueFilter(Workout.user_id, "User ID")]
    column_labels = {"duration": "Duration (min)"}
    column_formatters = {"user_id": link_to("user")}
    column_formatters_detail = {
        "id": related_links(("Exercises", "workout-exercise", "workout_id")),
        "user_id": link_to("user"),
    }
    column_details_exclude_list = ["user", "exercises"]
    column_export_exclude_list = ["user", "exercises"]
    form_columns = ["name", "date", "duration", "in_progress"]


class WorkoutExerciseAdmin(AdminView, model=WorkoutExercise):
    """Changes are delivered to the clients as an update of the workout."""
    category = "Workouts"
    can_create = False
    column_list = ["id", "workout_id", "index", "exercise_id", "unilateral", "reps", "weights", "time", "intensity", "distance"]
    column_sortable_list = ["id", "workout_id", "index", "exercise_id"]
    column_default_sort = [("workout_id", True), ("index", False)]
    column_filters = [ValueFilter(WorkoutExercise.workout_id, "Workout ID"), ValueFilter(WorkoutExercise.exercise_id, "Exercise ID")]
    column_formatters = {"workout_id": link_to("workout"), "exercise_id": link_to("exercise")}
    column_formatters_detail = column_formatters
    column_details_exclude_list = ["workout"]
    column_export_exclude_list = ["workout"]
    form_columns = ["exercise_id", "index", "unilateral", "reps", "weights", "time", "intensity", "distance"]
    form_overrides = {column: NumberListField for column in ["reps", "weights", "time", "intensity", "distance"]}
    form_args = {"reps": {"number_type": int}, "time": {"number_type": int}}


class WorkoutSchemeAdmin(SoftDeleteMixin, AdminView, model=WorkoutScheme):
    name = "Scheme"
    category = "Workouts"
    can_create = False
    column_list = ["id", "user_id", "name", "last_performed", "created_at", "deleted_at"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "user_id", "name", "last_performed", "created_at", "updated_at", "deleted_at"]
    column_default_sort = ("id", True)
    column_filters = [NullFilter(WorkoutScheme.deleted_at, "Deleted"), ValueFilter(WorkoutScheme.user_id, "User ID")]
    column_formatters = {"user_id": link_to("user")}
    column_formatters_detail = {
        "id": related_links(("Exercises", "workout-scheme-exercise", "workout_scheme_id")),
        "user_id": link_to("user"),
    }
    column_details_exclude_list = ["exercises"]
    column_export_exclude_list = ["exercises"]
    form_columns = ["name", "last_performed"]


class WorkoutSchemeExerciseAdmin(AdminView, model=WorkoutSchemeExercise):
    """Changes are delivered to the clients as an update of the scheme."""
    name = "Scheme exercise"
    category = "Workouts"
    can_create = False
    column_list = ["id", "workout_scheme_id", "index", "exercise_id"]
    column_sortable_list = ["id", "workout_scheme_id", "index", "exercise_id"]
    column_default_sort = [("workout_scheme_id", True), ("index", False)]
    column_filters = [ValueFilter(WorkoutSchemeExercise.workout_scheme_id, "Scheme ID"), ValueFilter(WorkoutSchemeExercise.exercise_id, "Exercise ID")]
    column_labels = {"workout_scheme_id": "Scheme"}
    column_formatters = {"workout_scheme_id": link_to("workout-scheme"), "exercise_id": link_to("exercise")}
    column_formatters_detail = column_formatters
    form_columns = ["exercise_id", "index"]


class ChatAdmin(SoftDeleteMixin, ImageUploadMixin, AdminView, model=Chat):
    """
    Renames and images reach the clients through the chat delta. Only group chats have an image. Deleted chats are left
    out of every response, the clients remove them because the delta only lists existing chats.
    """
    category = "Chats"
    can_create = False
    column_list = ["id", "image_url", "name", "group_chat", "public", "created_by", "latest_message_timestamp", "latest_message_preview", "deleted_at"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "name", "group_chat", "public", "created_by", "created_at", "latest_message_timestamp", "deleted_at"]
    column_default_sort = ("latest_message_timestamp", True)
    column_filters = [BooleanFilter(Chat.group_chat), BooleanFilter(Chat.public), NullFilter(Chat.deleted_at, "Deleted"), ValueFilter(Chat.created_by, "Creator ID")]
    column_labels = {"image_url": "Image", "latest_message_timestamp": "Latest message", "latest_message_preview": "Preview"}
    column_formatters = {"image_url": image_preview(32), "created_by": link_to("user")}
    column_formatters_detail = {
        "id": related_links(("Members", "chat-user", "chat_id"), ("Messages", "message", "chat_id"), ("Reports", "report", "reported_chat_id")),
        "image_url": image_preview(300),
        **{column: link_to("user") for column in ["created_by", "latest_message_sender_id", "name_updated_by", "image_updated_by"]},
    }
    form_columns = ["name", "public", "image_url"]
    form_overrides = {"image_url": ImageFileField}
    form_args = {"image_url": {"label": "Image", "description": "Only for group chats."}}
    image_columns = {"image_url": CHAT_IMAGE_PRESET}
    image_columns_owned = ("image_url",)

    async def on_model_change(self, data: dict, model: Any, is_created: bool, request: Request) -> None:
        upload = data.get("image_url")
        if not model.group_chat and isinstance(upload, UploadFile) and upload.filename:
            raise ValueError("Only group chats have an image.")
        await super().on_model_change(data, model, is_created, request)

    def delete_permanently(self, session: Session, obj: Chat) -> None:
        # The messages are removed together with the chat
        for image_hash in session.scalars(select(Message.image_url).where(Message.chat_id == obj.id, Message.image_url.is_not(None))):
            image_service.discard_image(session, image_hash)
        super().delete_permanently(session, obj)

    @action("remove-image", "Remove image", "Remove the images of the selected chats?")
    async def remove_image_action(self, request: Request) -> RedirectResponse:
        def run(session: Session, chat: Chat) -> None:
            image_service.discard_image(session, chat.image_url)
            chat.image_url = None
        return await self.for_each_selected(request, run)


class ChatUserAdmin(AdminView, model=ChatUser):
    """
    Chat memberships. Deleting a row removes the user from the chat, a group chat without admins then gets a random
    member as admin. Admin is empty for direct chats.
    """
    name = "Chat member"
    category = "Chats"
    column_list = ["chat_id", "user_id", "admin", "last_read_message_id", "joined_at"]
    column_sortable_list = ["chat_id", "user_id", "admin", "last_read_message_id", "joined_at"]
    column_details_list = ["chat_id", "user_id", "admin", "last_read_message_id", "joined_at"]
    column_filters = [ValueFilter(ChatUser.chat_id, "Chat ID"), ValueFilter(ChatUser.user_id, "User ID"), BooleanFilter(ChatUser.admin)]
    column_formatters = {"chat_id": link_to("chat"), "user_id": link_to("user"), "last_read_message_id": link_to("message")}
    column_formatters_detail = column_formatters
    form_columns = ["chat_id", "user_id", "admin", "last_read_message_id"]
    form_args = {"last_read_message_id": {"default": 0}, "admin": {"description": "Only for group chats, leave it empty for direct chats."}}

    async def delete_model(self, request: Request, pk: Any) -> None:
        def run(session: Session) -> None:
            membership = session.execute(self._stmt_by_identifier(pk)).scalars().one()
            chat_id = membership.chat_id
            session.delete(membership)
            session.flush()
            chat_crud.ensure_admin(session, chat_id)
        await self.run_in_session(run)


class MessageAdmin(SoftDeleteMixin, AdminView, model=Message):
    """
    Deletions reach the clients through the chat delta, which delivers the message with deleted_at set, restores
    through the chat delta too (it delivers messages whose updated_at changed). Only messages deleted in the admin can be
    restored, the apps empty the text and photo of the messages their senders delete.
    Edits of the content are only visible on devices that load the chats from scratch (new logins), devices that
    already received the message keep the old text.
    """
    category = "Chats"
    can_create = False
    column_list = ["id", "chat_id", "sender_id", "content", "image_url", "created_at", "deleted_at"]
    column_searchable_list = ["content"]
    column_sortable_list = ["id", "chat_id", "sender_id", "created_at", "updated_at", "deleted_at"]
    column_default_sort = ("id", True)
    column_filters = [
        NullFilter(Message.image_url, "Image"),
        NullFilter(Message.deleted_at, "Deleted"),
        ValueFilter(Message.chat_id, "Chat ID"),
        ValueFilter(Message.sender_id, "Sender ID"),
    ]
    column_labels = {"image_url": "Image"}
    column_formatters = {
        "chat_id": link_to("chat"), "sender_id": link_to("user"),
        "content": truncate(80), "image_url": image_preview(40),
    }
    column_formatters_detail = {
        "id": related_links(("Reports", "report", "reported_message_id")),
        "chat_id": link_to("chat"), "sender_id": link_to("user"), "image_url": image_preview(500),
    }
    form_columns = ["content"]
    image_columns_owned = ("image_url",)

    def soft_delete(self, session: Session, obj: Message) -> None:
        # Unlike a deletion in the apps, the text and photo are kept, so that the message can be restored
        super().soft_delete(session, obj)
        session.flush()
        chat_service.refresh_latest_message(session, obj.chat_id)

    def restore(self, session: Session, obj: Message) -> None:
        # The apps (and account deletions) empty the text and remove the photo, only a deletion in the admin keeps them.
        # A message is never sent with an empty text, so "" marks a message without anything left to restore.
        if obj.deleted_at is not None and obj.content == "" and obj.image_url is None:
            raise ValueError(f"Message {obj.id} was deleted by its sender, its text and photo are gone and can't be restored.")
        super().restore(session, obj)
        session.flush()
        chat_service.refresh_latest_message(session, obj.chat_id)

    @action("remove-image", "Remove image", "Remove the images of the selected messages?")
    async def remove_image_action(self, request: Request) -> RedirectResponse:
        def run(session: Session, message: Message) -> None:
            image_service.discard_image(session, message.image_url)
            message.image_url = None
        return await self.for_each_selected(request, run)


class AIConversationAdmin(SoftDeleteMixin, AdminView, model=AIConversation):
    """
    Conversations of the users with the AI coach. The apps load them completely on every request, so changes are
    visible right away. Renaming a conversation moves it to the top of the list, like in the apps.
    """
    name = "AI conversation"
    category = "AI"
    can_create = False
    column_list = ["id", "user_id", "title", "created_at", "updated_at", "deleted_at"]
    column_searchable_list = ["title"]
    column_sortable_list = ["id", "user_id", "title", "created_at", "updated_at", "deleted_at"]
    column_default_sort = ("updated_at", True)
    column_filters = [NullFilter(AIConversation.deleted_at, "Deleted"), ValueFilter(AIConversation.user_id, "User ID")]
    column_formatters = {"user_id": link_to("user")}
    column_formatters_detail = {
        "id": related_links(("Messages", "ai-message", "conversation_id")),
        "user_id": link_to("user"),
    }
    form_columns = ["title"]


class AIMessageAdmin(AdminView, model=AIMessage):
    """Messages of the users and answers of the AI. Deleting a message removes it from the conversation for good."""
    name = "AI message"
    category = "AI"
    can_create = False
    column_list = ["id", "conversation_id", "role", "content", "created_at"]
    column_searchable_list = ["content"]
    column_sortable_list = ["id", "conversation_id", "role", "created_at"]
    column_default_sort = ("id", True)
    column_filters = [ValueFilter(AIMessage.conversation_id, "Conversation ID"), ValueFilter(AIMessage.role, "Role")]
    column_formatters = {"conversation_id": link_to("ai-conversation"), "content": truncate(80)}
    column_formatters_detail = {"conversation_id": link_to("ai-conversation")}
    form_columns = ["content"]


class SessionAdmin(AdminView, model=UserSession):
    """Login sessions. Deleting a session logs the device out."""
    category = "Users & Social"
    can_create = False
    can_edit = False
    column_list = ["id", "user_id", "agent", "ip_address", "created_at", "last_active_at"]
    column_searchable_list = ["ip_address", "agent"]
    column_sortable_list = ["id", "user_id", "agent", "created_at", "last_active_at"]
    column_default_sort = ("last_active_at", True)
    column_filters = [ValueFilter(UserSession.user_id, "User ID")]
    column_formatters = {"user_id": link_to("user")}
    column_formatters_detail = column_formatters
    column_details_exclude_list = ["session_token_hash"]
    column_export_exclude_list = ["session_token_hash"]
