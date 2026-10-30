from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import app.db.queries.exercises as exercise_crud
import app.db.queries.workouts as crud
from app.core.errors import ExerciseNotFoundError, WorkoutSchemeNotFoundError
from app.db.models import WorkoutScheme
from app.db.queries.sync import check_last_sync_time
from app.schemas import (
    CreateWorkoutSchemeRequest,
    SingleWorkoutSchemeDeltaResponse,
    UpdateWorkoutSchemeRequest,
    WorkoutSchemeDeltaResponse,
    WorkoutSchemeExerciseRequest,
    WorkoutSchemeExerciseResponse,
    WorkoutSchemeListResponse,
    WorkoutSchemeResponse,
)
from app.util.time import to_iso


def _get_owned_scheme(db: Session, user_id: int, workout_scheme_id: int, for_update: bool = False) -> WorkoutScheme:
    """
    Schemes of other users are reported as not found, so that existing IDs cannot be probed.
    """
    db_scheme = crud.get_workout_scheme_by_id(db, workout_scheme_id, for_update=for_update)
    if not db_scheme or db_scheme.deleted_at is not None or db_scheme.user_id != user_id:
        raise WorkoutSchemeNotFoundError(f"Workout scheme with ID {workout_scheme_id} not found.")
    return db_scheme


def _create_scheme_exercises(db: Session, user_id: int, db_scheme: WorkoutScheme, exercises: list[WorkoutSchemeExerciseRequest]) -> None:
    """
    Checks that the user may use the exercises.
    """
    for exercise in sorted(exercises, key=lambda ex: ex.index):
        if not exercise_crud.get_usable_exercise_by_id(db, exercise.exercise_id, user_id):
            raise ExerciseNotFoundError(f"Exercise with ID {exercise.exercise_id} not found.")
        db_scheme.exercises.append(
            crud.create_workout_scheme_exercise(
                db=db,
                workout_scheme_id=db_scheme.id,
                exercise_id=exercise.exercise_id,
                index=exercise.index
            )
        )


def _map_scheme(db_scheme: WorkoutScheme) -> WorkoutSchemeResponse:
    return WorkoutSchemeResponse(
        id=db_scheme.id,
        client_uuid=db_scheme.client_uuid,
        name=db_scheme.name,
        last_performed=to_iso(db_scheme.last_performed) if db_scheme.last_performed else None,
        exercises=[
            WorkoutSchemeExerciseResponse(id=ex.id, exercise_id=ex.exercise_id, index=ex.index)
            for ex in db_scheme.exercises
        ]
    )


def get_all_workout_schemes(db: Session, user_id: int) -> WorkoutSchemeListResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    sync_time = crud.get_sync_time(db)
    db_schemes = crud.get_all_workout_schemes_for_user(db, user_id)

    return WorkoutSchemeListResponse(
        schemes=[_map_scheme(db_scheme) for db_scheme in db_schemes],
        sync_time=to_iso(sync_time)
    )


def get_workout_scheme_delta(db: Session, user_id: int, last_sync_time: datetime) -> WorkoutSchemeDeltaResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    current_sync_time = crud.get_sync_time(db)
    last_sync_time = check_last_sync_time(db, last_sync_time)

    db_schemes = crud.get_workout_scheme_delta(db, user_id, last_sync_time)

    updates = []
    for db_scheme in db_schemes:
        if db_scheme.deleted_at:
            if db_scheme.deleted_at < last_sync_time:
                continue # Deletion was already synced
            # Reported even if the scheme was created after the last sync, since the client may have received it already
            updates.append(SingleWorkoutSchemeDeltaResponse(id=db_scheme.id, client_uuid=db_scheme.client_uuid, action=2))
            continue

        action = 0 if db_scheme.created_at >= last_sync_time else 1  # Created / Updated
        updates.append(
            SingleWorkoutSchemeDeltaResponse(
                action=action,
                **_map_scheme(db_scheme).model_dump()
            )
        )

    return WorkoutSchemeDeltaResponse(
        updates=updates,
        sync_time=to_iso(current_sync_time)
    )


def create_workout_scheme(db: Session, user_id: int, payload: CreateWorkoutSchemeRequest) -> WorkoutSchemeResponse:
    """
    If the user already created a scheme with the same client UUID, that scheme is returned instead.
    """
    if payload.client_uuid is not None:
        # Locked, so that a concurrent retry of the same request waits and then finds the created scheme
        crud.lock_user(db, user_id)
        existing_scheme = crud.get_workout_scheme_by_client_uuid(db, user_id, payload.client_uuid)
        if existing_scheme:
            return _map_scheme(existing_scheme)

    db_scheme = crud.create_workout_scheme(db=db, user_id=user_id, name=payload.name, client_uuid=payload.client_uuid)
    db.flush()

    _create_scheme_exercises(db, user_id, db_scheme, payload.exercises)
    db.flush()

    return _map_scheme(db_scheme)


def update_workout_scheme(db: Session, user_id: int, workout_scheme_id: int, payload: UpdateWorkoutSchemeRequest) -> WorkoutSchemeResponse:
    db_scheme = _get_owned_scheme(db, user_id, workout_scheme_id, for_update=True)

    changes = payload.model_dump(exclude_unset=True)
    if changes:
        # The validators reject null for sent fields, so these are only None when they were omitted
        if payload.name is not None:
            db_scheme.name = payload.name

        if payload.exercises is not None:
            # Removing them from the collection deletes the rows (delete-orphan cascade)
            db_scheme.exercises.clear()
            db.flush()
            _create_scheme_exercises(db, user_id, db_scheme, payload.exercises)

        db_scheme.updated_at = func.now()
        db.flush()

    return _map_scheme(db_scheme)


def mark_workout_scheme_performed(db: Session, user_id: int, workout_scheme_id: int) -> WorkoutSchemeResponse:
    db_scheme = _get_owned_scheme(db, user_id, workout_scheme_id)

    db_scheme.last_performed = func.now()
    db_scheme.updated_at = func.now()
    db.flush()
    db.refresh(db_scheme, attribute_names=["last_performed"])

    return _map_scheme(db_scheme)


def delete_workout_scheme(db: Session, user_id: int, workout_scheme_id: int) -> None:
    """
    Its exercises are kept with it.
    """
    db_scheme = _get_owned_scheme(db, user_id, workout_scheme_id)

    db_scheme.deleted_at = func.now()
    db.flush()
