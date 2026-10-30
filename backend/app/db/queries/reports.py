
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Report


def create_report(
    db: Session,
    reporter_id: int | None,
    reason: str,
    reported_user_id: int | None = None,
    reported_chat_id: int | None = None,
    reported_message_id: int | None = None,
    uploader_id: int | None = None,
    **copy: str | None,
) -> Report:
    """
    Creates a report. copy holds the copied content (user_name, profile_image, chat_name, chat_image, message_text,
    message_image), see report_service. Automatic reports of NudeNet have no reporter, but the uploader.
    """
    report = Report(
        reporter_id=reporter_id,
        uploader_id=uploader_id,
        reported_user_id=reported_user_id,
        reported_chat_id=reported_chat_id,
        reported_message_id=reported_message_id,
        reason=reason,
        **copy,
    )
    db.add(report)
    return report


def get_report(
    db: Session,
    reporter_id: int,
    reported_user_id: int | None,
    reported_chat_id: int | None,
    reported_message_id: int | None,
) -> Report | None:
    """
    Fetches an open report of the reporter for the same user, chat or message (exactly one of them is given).
    """
    targets = [
        (Report.reported_user_id, reported_user_id),
        (Report.reported_chat_id, reported_chat_id),
        (Report.reported_message_id, reported_message_id),
    ]
    return db.scalars(
        select(Report).where(
            Report.reporter_id == reporter_id,
            *(column == value for column, value in targets if value is not None),
        )
    ).first()

