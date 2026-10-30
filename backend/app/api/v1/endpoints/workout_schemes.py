from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import (
    CreateWorkoutSchemeRequest,
    UpdateWorkoutSchemeRequest,
    WorkoutSchemeDeltaResponse,
    WorkoutSchemeListResponse,
    WorkoutSchemeResponse,
)
from app.services import workout_scheme_service

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK, response_model=WorkoutSchemeListResponse)
@limiter.limit("10/minute")
def get_all(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all workout schemes including their exercises for the current user, together with the
    sync_time to pass to /workout-schemes/delta for the next sync.
    """
    return workout_scheme_service.get_all_workout_schemes(db, user.id)


@router.get("/delta", status_code=status.HTTP_200_OK, response_model=WorkoutSchemeDeltaResponse)
@limiter.limit("60/minute")
def get_delta(
    request: Request,
    last_sync_time: datetime,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves workout schemes that have been created, updated or deleted since the provided timestamp.
    Changed schemes always contain their complete list of exercises.
    A last_sync_time older than 28 days is rejected with 400 (SyncTimeExpiredError): load everything with GET /workout-schemes instead.
    """
    return workout_scheme_service.get_workout_scheme_delta(db, user.id, last_sync_time)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WorkoutSchemeResponse)
@limiter.limit("100/minute")
def create_workout_scheme(
    request: Request,
    payload: CreateWorkoutSchemeRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return workout_scheme_service.create_workout_scheme(db, user.id, payload)


@router.patch("/{workout_scheme_id}", status_code=status.HTTP_200_OK, response_model=WorkoutSchemeResponse)
@limiter.limit("100/minute")
def update_workout_scheme(
    request: Request,
    workout_scheme_id: int,
    payload: UpdateWorkoutSchemeRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Updates the name and/or replaces the complete exercise list of a workout scheme if it belongs to the current user.
    """
    return workout_scheme_service.update_workout_scheme(db, user.id, workout_scheme_id, payload)


@router.post("/{workout_scheme_id}/performances", status_code=status.HTTP_200_OK, response_model=WorkoutSchemeResponse)
@limiter.limit("10/minute")
def mark_workout_scheme_performed(
    request: Request,
    workout_scheme_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Sets last_performed of a workout scheme to the current time if it belongs to the current user.
    Call this when a workout based on the scheme is started.
    """
    return workout_scheme_service.mark_workout_scheme_performed(db, user.id, workout_scheme_id)


@router.delete("/{workout_scheme_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_workout_scheme(
    request: Request,
    workout_scheme_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    workout_scheme_service.delete_workout_scheme(db, user.id, workout_scheme_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
