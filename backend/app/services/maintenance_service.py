from datetime import timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, delete, exists, false, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIConversation,
    Chat,
    Exercise,
    Message,
    Report,
    RequestStat,
    User,
    Workout,
    WorkoutExercise,
    WorkoutScheme,
    WorkoutSchemeExercise,
)
from app.db.models import Session as UserSession
from app.db.queries.session import is_session_expired
from app.db.queries.sync import DELTA_MAX_AGE
from app.services import image_service

# Soft deleted rows are removed permanently by remove_old_data once they have been deleted for this long
RETENTION = timedelta(days=30)
# Accounts whose email was never verified are removed after this long, so they don't reserve their username and email
UNVERIFIED_RETENTION = timedelta(days=3)
# The hourly request counts of the admin's traffic page are kept this long
REQUEST_STATS_RETENTION = timedelta(days=90)

# Clients that synced longer ago than RETENTION would miss the deletions of the removed rows, the delta endpoints
# reject their sync time and they load everything instead
assert DELTA_MAX_AGE < RETENTION, "DELTA_MAX_AGE must stay below RETENTION"

SOFT_DELETED_MODELS = {
    "users": User,
    "exercises": Exercise,
    "workouts": Workout,
    "schemes": WorkoutScheme,
    "chats": Chat,
    "messages": Message,
    "AI conversations": AIConversation,
}


def _is_old(model: Any) -> Any:
    return model.deleted_at < func.now() - RETENTION


def _is_stale_unverified() -> Any:
    """
    Signups that never verified their email. Accounts that have logged in before (last_login) are kept, e.g. one
    that was marked unverified in the admin.
    """
    return (
        (User.active == false())
        & (User.last_login.is_(None))
        & (User.deleted_at.is_(None))
        & (User.created_at < func.now() - UNVERIFIED_RETENTION)
    )


def count_old_data(session: Session) -> int:
    """Number of rows that remove_old_data would remove (not counting the dependent rows)."""
    soft_deleted = sum(
        session.execute(select(func.count()).select_from(model).where(_is_old(model))).scalar_one()
        for model in SOFT_DELETED_MODELS.values()
    )
    return (
        soft_deleted
        + session.execute(select(func.count()).select_from(User).where(_is_stale_unverified())).scalar_one()
        + session.execute(select(func.count()).select_from(UserSession).where(is_session_expired())).scalar_one()
    )


def remove_old_data(session: Session) -> tuple[dict[str, int], int]:
    """
    Permanently deletes the rows that were soft deleted longer than RETENTION ago and the accounts that weren't verified
    within UNVERIFIED_RETENTION, together with their dependent rows (ON DELETE rules) and the images they reference.
    The workouts, schemes and unverified exercises of the removed users go with them, exercises that workouts or schemes
    still use are kept. Also removes the old request stats and the expired login sessions.
    Returns the number of removed rows per table and the number of kept exercises.
    """
    removed: dict[str, int] = {}
    old_users = select(User.id).where(or_(_is_old(User), _is_stale_unverified()))
    old_chats = select(Chat.id).where(_is_old(Chat))

    def discard(statement: Any) -> None:
        for value in session.scalars(statement):
            for image_hash in value if isinstance(value, list) else [value]:
                image_service.discard_image(session, image_hash)

    def remove(label: str, model: Any, condition: Any) -> None:
        removed[label] = cast(CursorResult[Any], session.execute(delete(model).where(condition))).rowcount

    remove("AI conversations", AIConversation, _is_old(AIConversation))

    discard(select(Message.image_url).where(_is_old(Message), Message.image_url.is_not(None)))
    remove("messages", Message, _is_old(Message))

    discard(select(Chat.image_url).where(Chat.id.in_(old_chats), Chat.image_url.is_not(None)))
    discard(select(Message.image_url).where(Message.chat_id.in_(old_chats), Message.image_url.is_not(None)))
    remove("chats", Chat, Chat.id.in_(old_chats))

    remove("schemes", WorkoutScheme, or_(_is_old(WorkoutScheme), WorkoutScheme.user_id.in_(old_users)))
    remove("workouts", Workout, or_(_is_old(Workout), Workout.user_id.in_(old_users)))

    # Unverified exercises are only visible to their creators, so nobody can use them once the creator is gone
    old_exercises = or_(_is_old(Exercise), Exercise.user_id.in_(old_users) & (Exercise.verified == false()))
    used = or_(
        exists().where(WorkoutExercise.exercise_id == Exercise.id),
        exists().where(WorkoutSchemeExercise.exercise_id == Exercise.id),
    )
    discard(select(Exercise.image_urls).where(old_exercises, ~used))
    remove("exercises", Exercise, old_exercises & ~used)
    kept_exercises = session.execute(select(func.count()).select_from(Exercise).where(_is_old(Exercise))).scalar_one()

    # Reports go with their reporter (ON DELETE CASCADE), their image copies with them. Reports of removed users, chats and
    # messages are kept with their copies, only the reference is emptied (ON DELETE SET NULL).
    for column in (Report.profile_image, Report.chat_image, Report.message_image):
        discard(select(column).where(Report.reporter_id.in_(old_users), column.is_not(None)))

    # The profile images of deleted accounts were already removed with the deletion, unverified ones can't have any
    remove("users", User, _is_old(User))
    remove("unverified accounts", User, _is_stale_unverified())

    # check_session_token already rejects them, they are only kept until here
    remove("expired sessions", UserSession, is_session_expired())
    remove("hourly request stats", RequestStat, RequestStat.hour < func.now() - REQUEST_STATS_RETENTION)

    return removed, kept_exercises
