from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import CreateReportRequest, ReportResponse
from app.services import report_service

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ReportResponse)
@limiter.limit("10/minute")
def create_report(
    payload: CreateReportRequest,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Reports exactly one user, group chat or message with a reason, for the admin to review within 24 hours.
    Blocking a user is a separate request (PUT /users/me/blocked-users/{user_id}).
    """
    return report_service.create_report(db, user, payload)
