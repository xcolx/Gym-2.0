from typing import Any, Literal

from PIL import Image
from sqlalchemy.orm import Session

import app.db.queries.chat as chat_crud
import app.db.queries.reports as crud
import app.db.queries.users as user_crud
from app.core.errors import (
    ChatNotFoundError,
    InvalidUserActionError,
    MessageNotFoundError,
    ObjectionableContentError,
    UserNotFoundError,
)
from app.core.nudity_filter import BLOCKED_MESSAGE, Verdict
from app.db.models import Chat, Message, User
from app.schemas import CreateReportRequest, ReportResponse
from app.services import image_service
from app.util.time import to_iso


def _copy_of(db: Session, target: User | Chat | Message) -> dict[str, Any]:
    """
    The copy of the reported content the report keeps, so that it can still be reviewed after the reported user,
    chat or message was changed or deleted. The images are copied, the report owns the copies.
    """
    if isinstance(target, User):
        return {"user_name": target.user_name, "profile_image": image_service.copy_image(db, target.profile_image_url)}
    if isinstance(target, Chat):
        return {"chat_name": target.name, "chat_image": image_service.copy_image(db, target.image_url)}
    sender = user_crud.get_user_by_id(db, target.sender_id) if target.sender_id is not None else None
    return {
        "user_name": sender.user_name if sender else None,
        "message_text": target.content,
        "message_image": image_service.copy_image(db, target.image_url),
    }


def create_report(db: Session, user: User, payload: CreateReportRequest) -> ReportResponse:
    """
    Reports a user, a group chat or a message for the admin to review. Only what the user can see can be reported:
    other users, group chats the user is a member of or that are public, and messages of others in the user's chats.
    The same user, chat or message can only be reported once until the report is handled.
    The report keeps a copy of the reported name, text and images (see _copy_of).
    """
    target: User | Chat | Message
    if payload.reported_user_id is not None:
        if payload.reported_user_id == user.id:
            raise InvalidUserActionError("You cannot report yourself.")
        reported_user = user_crud.get_user_by_id(db, payload.reported_user_id)
        if not reported_user:
            raise UserNotFoundError("User not found.")
        target = reported_user
        already_reported = "You already reported this user."

    elif payload.reported_chat_id is not None:
        chat = chat_crud.get_chat_by_id(db, payload.reported_chat_id)
        is_member = chat is not None and chat_crud.get_membership(db, chat.id, user.id) is not None
        # Private chats of others are reported as not found, so their existence is not revealed
        if not chat or not (is_member or chat.public):
            raise ChatNotFoundError(f"Chat with ID {payload.reported_chat_id} not found.")
        if not chat.group_chat:
            raise InvalidUserActionError("Report the other user instead of the direct chat.")
        target = chat
        already_reported = "You already reported this group."

    else:
        assert payload.reported_message_id is not None  # CreateReportRequest requires exactly one target
        message = chat_crud.get_message_by_id(db, payload.reported_message_id)
        if not message or not chat_crud.get_membership(db, message.chat_id, user.id):
            raise MessageNotFoundError(f"Message with ID {payload.reported_message_id} not found.")
        if message.sender_id == user.id:
            raise InvalidUserActionError("You cannot report your own message.")
        target = message
        already_reported = "You already reported this message."

    targets = (payload.reported_user_id, payload.reported_chat_id, payload.reported_message_id)
    if crud.get_report(db, user.id, *targets):
        raise InvalidUserActionError(already_reported)

    report = crud.create_report(
        db,
        reporter_id=user.id,
        reason=payload.reason,
        reported_user_id=payload.reported_user_id,
        reported_chat_id=payload.reported_chat_id,
        reported_message_id=payload.reported_message_id,
        **_copy_of(db, target),
    )
    db.flush()
    db.refresh(report)

    return ReportResponse(
        id=report.id,
        reported_user_id=report.reported_user_id,
        reported_chat_id=report.reported_chat_id,
        reported_message_id=report.reported_message_id,
        reason=report.reason,
        created_at=to_iso(report.created_at),
    )


def report_nudity(
    db: Session,
    verdict: Verdict,
    uploader: User,
    image: Image.Image,
    *,
    image_column: Literal["profile_image", "chat_image", "message_image"],
    quality: int,
    max_dimension: int,
    reported_user_id: int | None = None,
    reported_chat_id: int | None = None,
    reported_message_id: int | None = None,
    **copy: str | None,
) -> None:
    """
    Reports an upload that NudeNet flagged (core.nudity_filter) for the admin to review, in the same category as a
    report of a user would be: the user, group chat or message the image was uploaded for, with the copied name or
    text (copy) and its own copy of the image (image_column, stored with the quality and size of the upload).
    The report has no reporter, but the uploader. Does nothing if the verdict didn't flag the image.

    A flagged upload's report is part of its transaction. A blocked upload is rejected: its transaction is rolled back
    (which also releases the rows the request locked), the report is committed on its own and ObjectionableContentError
    is raised. Called for a blocked upload before its message or group is created, those are not referenced then.
    """
    if not verdict.flagged:
        return
    uploader_id = uploader.id

    if verdict.blocked:
        db.rollback()

    crud.create_report(
        db,
        reporter_id=None,
        uploader_id=uploader_id,
        reason=verdict.report_reason,
        reported_user_id=reported_user_id,
        reported_chat_id=reported_chat_id,
        reported_message_id=reported_message_id,
        **{image_column: image_service.store_image(db, image, quality=quality, max_dimension=max_dimension)},
        **copy,
    )

    if verdict.blocked:
        db.commit()
        raise ObjectionableContentError(BLOCKED_MESSAGE)
    db.flush()
