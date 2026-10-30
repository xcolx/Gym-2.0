from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import (
    CreateWorkoutRequest,
    UpdateWorkoutRequest,
    WorkoutDeltaResponse,
    WorkoutListResponse,
    WorkoutResponse,
)
from app.services import workout_service

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK, response_model=WorkoutListResponse)
@limiter.limit("10/minute")
def get_all(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves a list of all workouts for the current user, together with the
    sync_time to pass to /workouts/delta for the next sync.
    """
    return workout_service.get_all_workouts(db, user.id)


@router.get("/delta", status_code=status.HTTP_200_OK, response_model=WorkoutDeltaResponse)
@limiter.limit("60/minute")
def get_delta(
    request: Request,
    last_sync_time: datetime,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves workouts that have been created or updated since the provided timestamp.
    A last_sync_time older than 28 days is rejected with 400 (SyncTimeExpiredError): load everything with GET /workouts instead.
    """
    return workout_service.get_workout_delta(db, user.id, last_sync_time)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WorkoutResponse)
@limiter.limit("1000/minute")
def create_workout(
    request: Request,
    payload: CreateWorkoutRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return workout_service.create_workout(db, user.id, payload)


@router.patch("/{workout_id}", status_code=status.HTTP_200_OK, response_model=WorkoutResponse)
@limiter.limit("300/minute")
def update_workout(
    request: Request,
    workout_id: int,
    payload: UpdateWorkoutRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Updates an existing workout if it belongs to the current user and applies the changes to its exercises.
    The workout fields are applied first, then every entry of exercise_changes in order:
    - create: inserts a new workout exercise at the given index, exercises at or after it are moved back by one.
      If the workout already contains an exercise with the same client UUID, nothing is changed.
    - update: updates the workout exercise with the given ID, a changed index shifts the exercises in between.
      Workout exercises of other workouts are reported as not found.
    The request is atomic: if one change fails, nothing is applied.
    Returns the whole workout, so that clients can map created exercises by their client UUID.
    """
    return workout_service.update_workout(db, user.id, workout_id, payload)


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_workout(
    request: Request,
    workout_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    workout_service.delete_workout(db, user.id, workout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
