import json
import tempfile
import zipfile
from datetime import UTC, datetime
from typing import IO, Any

from sqlalchemy.orm import Session

import app.db.queries.takeout as crud
from app.core import nudity_filter
from app.core.errors import ImageNotFoundError
from app.db.models import User
from app.services import image_service
from app.util.time import to_iso

# Version of the structure of the takeout file, raised when it changes incompatibly
TAKEOUT_FORMAT_VERSION = 1
# The archive is kept in memory up to this size, larger ones (mostly images) are written to a temporary file
_ARCHIVE_MEMORY_LIMIT = 16 * 1024 * 1024


def _iso(value: datetime | None) -> str | None:
    return to_iso(value) if value is not None else None


def _numbers(values: list | None) -> list | None:
    # NUMERIC columns are loaded as Decimal
    return [float(value) for value in values] if values is not None else None


def build_takeout(db: Session, user: User) -> dict[str, Any]:
    """
    Collects all data stored about the user (GDPR data access), including soft deleted rows that are still stored.
    Secrets (password hash, session and email tokens) are left out. Images are listed by their hash, build_archive
    adds their files.
    """
    friends = crud.get_friends(db, user.id)
    friend_requests = crud.get_friend_requests(db, user.id)
    blocks = crud.get_blocks(db, user.id)
    reports = crud.get_reports(db, user.id)
    nudenet_reports = crud.get_nudenet_reports(db, user.id)
    exercises = crud.get_exercises(db, user.id)
    workouts = crud.get_workouts(db, user.id)
    schemes = crud.get_workout_schemes(db, user.id)
    memberships = crud.get_chat_memberships(db, user.id)
    members = crud.get_chat_members(db, [chat.id for _, chat in memberships])
    conversations = crud.get_ai_conversations(db, user.id)
    ai_messages = crud.get_ai_messages(db, [conversation.id for conversation in conversations])

    usernames = crud.get_usernames(
        db,
        {r.sender_id for r in friend_requests} | {r.receiver_id for r in friend_requests} | {b.blocked_id for b in blocks}
        | {r.reported_user_id for r in reports if r.reported_user_id is not None},
    )
    exercise_names = crud.get_exercise_names(
        db,
        {ex.exercise_id for w in workouts for ex in w.exercises} | {ex.exercise_id for s in schemes for ex in s.exercises},
    )

    members_by_chat: dict[int, list] = {}
    for membership, member in members:
        members_by_chat.setdefault(membership.chat_id, []).append({"user_id": member.id, "username": member.user_name, "admin": membership.admin})

    messages_by_conversation: dict[int, list] = {}
    for message in ai_messages:
        messages_by_conversation.setdefault(message.conversation_id, []).append({
            "role": message.role,
            "content": message.content,
            "created_at": _iso(message.created_at),
        })

    return {
        "export": {
            "format_version": TAKEOUT_FORMAT_VERSION,
            "created_at": to_iso(datetime.now(UTC)),
            "notes": "All data Gym 2.0 stores about your account. Deleted items that are still stored are included "
                     "with deleted_at. Images are listed by their hash, the files are in the images folder "
                     "(images/<hash>.jpg). Weights are in kg, bodyweight in kg, "
                     "workout durations in minutes, times in seconds and distances in meters.",
        },
        "account": {
            "id": user.id,
            "username": user.user_name,
            "email": user.email,
            "email_verified": user.active,
            "pending_email_change": user.email_change,
            "sign_in_provider": user.oauth_provider,
            "profile_image": user.profile_image_url,
            "profile_icon": user.profile_icon_url,
            "bodyweight": float(user.bodyweight) if user.bodyweight is not None else None,
            "scheme_color": user.scheme_color,
            "weight_unit": user.weight_unit,
            "distance_unit": user.distance_unit,
            "language": user.language,
            "uses_ios": user.uses_ios,
            "uses_web": user.uses_web,
            "created_at": _iso(user.created_at),
            "last_login": _iso(user.last_login),
            "failed_login_attempts": user.failed_login_attempts,
            "username_updated_at": _iso(user.updated_username_at),
            "image_updated_at": _iso(user.updated_image_at),
            "bodyweight_updated_at": _iso(user.updated_bodyweight_at),
            "password_updated_at": _iso(user.updated_pw_at),
        },
        "sessions": [
            {
                "client": session.agent,
                "ip_address": session.ip_address,
                "created_at": _iso(session.created_at),
                "last_active_at": _iso(session.last_active_at),
            }
            for session in crud.get_sessions(db, user.id)
        ],
        "friends": [
            {"user_id": other.id, "username": other.user_name, "since": _iso(friend.since)}
            for friend, other in friends
        ],
        "friend_requests": [
            {
                "direction": "sent" if request.sender_id == user.id else "received",
                "user_id": other_id,
                "username": usernames.get(other_id),
                "sent_at": _iso(request.timestamp),
                "status": {None: "pending", True: "accepted", False: "declined"}[request.accepted],
            }
            for request in friend_requests
            for other_id in [request.receiver_id if request.sender_id == user.id else request.sender_id]
        ],
        "blocked_users": [
            {
                "user_id": block.blocked_id,
                "username": usernames.get(block.blocked_id),
                "since": _iso(block.since),
            }
            for block in blocks
        ],
        "reports": [
            {
                "reported_user_id": report.reported_user_id,
                "reported_username": usernames.get(report.reported_user_id) if report.reported_user_id else None,
                "reported_chat_id": report.reported_chat_id,
                "reported_message_id": report.reported_message_id,
                "reason": report.reason,
                "created_at": _iso(report.created_at),
            }
            for report in reports
        ],
        "nudenet_reports": [
            {
                "upload": (
                    "profile_image" if report.profile_image else "group_image" if report.chat_image else "chat_photo"
                ),
                "blocked": report.reason.startswith(nudity_filter.BLOCKED_REASON),
                "reason": report.reason,
                "image": report.profile_image or report.chat_image or report.message_image,
                "chat_id": report.reported_chat_id,
                "chat_name": report.chat_name,
                "message_id": report.reported_message_id,
                "message_text": report.message_text,
                "created_at": _iso(report.created_at),
            }
            for report in nudenet_reports
        ],
        "exercises": [
            {
                "id": exercise.id,
                "name": exercise.name,
                "description": exercise.description,
                "aliases": exercise.aliases,
                "images": exercise.image_urls,
                "muscle_group_id": exercise.muscle_group_id,
                "equipment_id": exercise.equipment_id,
                "primary_muscle_ids": [em.muscle_id for em in exercise.exercise_muscles if em.is_primary],
                "secondary_muscle_ids": [em.muscle_id for em in exercise.exercise_muscles if not em.is_primary],
                "tracks": {
                    "reps": exercise.reps,
                    "weights": exercise.weights,
                    "time": exercise.time,
                    "intensity": exercise.intensity,
                    "distance": exercise.distance,
                },
                "verified": exercise.verified,
                "created_at": _iso(exercise.created_at),
                "updated_at": _iso(exercise.updated_at),
                "deleted_at": _iso(exercise.deleted_at),
            }
            for exercise in exercises
        ],
        "workouts": [
            {
                "id": workout.id,
                "name": workout.name,
                "date": _iso(workout.date),
                "duration": workout.duration,
                "in_progress": workout.in_progress,
                "created_at": _iso(workout.created_at),
                "updated_at": _iso(workout.updated_at),
                "deleted_at": _iso(workout.deleted_at),
                "exercises": [
                    {
                        "index": ex.index,
                        "exercise_id": ex.exercise_id,
                        "exercise_name": exercise_names.get(ex.exercise_id),
                        "unilateral": ex.unilateral,
                        "reps": ex.reps,
                        "weights": _numbers(ex.weights),
                        "time": ex.time,
                        "intensity": _numbers(ex.intensity),
                        "distance": _numbers(ex.distance),
                    }
                    for ex in workout.exercises
                ],
            }
            for workout in workouts
        ],
        "workout_schemes": [
            {
                "id": scheme.id,
                "name": scheme.name,
                "last_performed": _iso(scheme.last_performed),
                "created_at": _iso(scheme.created_at),
                "updated_at": _iso(scheme.updated_at),
                "deleted_at": _iso(scheme.deleted_at),
                "exercises": [
                    {"index": ex.index, "exercise_id": ex.exercise_id, "exercise_name": exercise_names.get(ex.exercise_id)}
                    for ex in scheme.exercises
                ],
            }
            for scheme in schemes
        ],
        "chats": [
            {
                "id": chat.id,
                "group_chat": chat.group_chat,
                "name": chat.name,
                "image": chat.image_url,
                "public": chat.public,
                "created_by_you": chat.created_by == user.id,
                "admin": membership.admin,
                "created_at": _iso(chat.created_at),
                "joined_at": _iso(membership.joined_at),
                "last_read_message_id": membership.last_read_message_id,
                "deleted_at": _iso(chat.deleted_at),
                "members": members_by_chat.get(chat.id, []),
            }
            for membership, chat in memberships
        ],
        "sent_messages": [
            {
                "id": message.id,
                "chat_id": message.chat_id,
                "content": message.content,
                "image": message.image_url,
                "created_at": _iso(message.created_at),
                "deleted_at": _iso(message.deleted_at),
            }
            for message in crud.get_sent_messages(db, user.id)
        ],
        "ai_conversations": [
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": _iso(conversation.created_at),
                "updated_at": _iso(conversation.updated_at),
                "deleted_at": _iso(conversation.deleted_at),
                "messages": messages_by_conversation.get(conversation.id, []),
            }
            for conversation in conversations
        ],
    }


def _image_hashes(takeout: dict[str, Any]) -> list[str]:
    """The hashes of all images the takeout references, in the order they appear."""
    account = takeout["account"]
    hashes = [
        account["profile_image"], account["profile_icon"],
        *(report["image"] for report in takeout["nudenet_reports"]),
        *(image for exercise in takeout["exercises"] for image in exercise["images"] or []),
        *(chat["image"] for chat in takeout["chats"]),
        *(message["image"] for message in takeout["sent_messages"]),
    ]
    return list(dict.fromkeys(image_hash for image_hash in hashes if image_hash))


def build_archive(takeout: dict[str, Any], folder: str) -> IO[bytes]:
    """
    Writes the takeout as a ZIP archive with one folder: <folder>/data.json and <folder>/images/<hash>.jpg for every
    image it references. Images whose file is gone (e.g. removed while the archive is written) are left out.
    Returns the archive as a file positioned at its start, the caller closes it.
    """
    archive = tempfile.SpooledTemporaryFile(max_size=_ARCHIVE_MEMORY_LIMIT)  # noqa: SIM115 - returned open, the caller closes it
    try:
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(f"{folder}/data.json", json.dumps(takeout, ensure_ascii=False, indent=2))
            for image_hash in _image_hashes(takeout):
                try:
                    path = image_service.get_image_path(image_hash)
                    # JPEGs are already compressed, so they're only stored
                    zip_file.write(path, f"{folder}/images/{image_hash}.jpg", compress_type=zipfile.ZIP_STORED)
                except (ImageNotFoundError, FileNotFoundError):
                    continue
    except BaseException:
        archive.close()
        raise
    archive.seek(0)
    return archive
