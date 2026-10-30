from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import app.db.queries.exercises as exercise_crud
import app.db.queries.workouts as crud
from app.core.errors import (
    ExerciseNotFoundError,
    InvalidRepetitionCountError,
    InvalidWorkoutStateError,
    WorkoutExerciseNotFoundError,
    WorkoutNotFoundError,
)
from app.db.models import Exercise, Workout, WorkoutExercise
from app.db.queries.sync import check_last_sync_time
from app.schemas import (
    CreateWorkoutExerciseChange,
    CreateWorkoutRequest,
    SingleWorkoutDeltaResponse,
    UpdateWorkoutExerciseChange,
    UpdateWorkoutRequest,
    WorkoutDeltaResponse,
    WorkoutExerciseResponse,
    WorkoutListResponse,
    WorkoutResponse,
)
from app.schemas.workouts import MAX_EXERCISES
from app.util.time import to_iso

SET_FIELDS = ("reps", "weights", "time", "intensity", "distance")


def _get_owned_workout(db: Session, user_id: int, workout_id: int, for_update: bool = False) -> Workout:
    """
    Workouts of other users are reported as not found, so that existing IDs cannot be probed.
    """
    db_workout = crud.get_workout_by_id(db, workout_id, for_update=for_update)
    if not db_workout or db_workout.deleted_at is not None or db_workout.user_id != user_id:
        raise WorkoutNotFoundError(f"Workout with ID {workout_id} not found.")
    return db_workout


def _get_owned_workout_exercise(db: Session, user_id: int, workout_exercise_id: int) -> tuple[Workout, WorkoutExercise]:
    """
    The workout is locked, so that concurrent changes to the exercise order are serialized.
    """
    workout_id = crud.get_workout_id_of_workout_exercise(db, workout_exercise_id)
    not_found = WorkoutExerciseNotFoundError(f"Workout exercise with ID {workout_exercise_id} not found.")
    if workout_id is None:
        raise not_found

    try:
        db_workout = _get_owned_workout(db, user_id, workout_id, for_update=True)
    except WorkoutNotFoundError:
        raise not_found from None

    # Looked up again after locking, since it may have been deleted in the meantime
    db_workout_exercise = next((ex for ex in db_workout.exercises if ex.id == workout_exercise_id), None)
    if not db_workout_exercise:
        raise not_found

    return db_workout, db_workout_exercise


def _map_workout_exercise(ex: WorkoutExercise) -> WorkoutExerciseResponse:
    return WorkoutExerciseResponse(
        id=ex.id,
        client_uuid=ex.client_uuid,
        exercise_id=ex.exercise_id,
        unilateral=ex.unilateral,
        index=ex.index,
        reps=ex.reps,
        weights=ex.weights,
        time=ex.time,
        intensity=ex.intensity,
        distance=ex.distance
    )


def _map_workout(workout: Workout) -> WorkoutResponse:
    return WorkoutResponse(
        id=workout.id,
        client_uuid=workout.client_uuid,
        name=workout.name,
        date=to_iso(workout.date),
        duration=workout.duration,
        in_progress=workout.in_progress,
        # Sorted, since exercises created or moved in this session keep their position in the loaded collection
        exercises=[_map_workout_exercise(ex) for ex in sorted(workout.exercises, key=lambda ex: ex.index)]
    )


def _normalize_sets(exercise: Exercise, sets: dict) -> dict:
    """
    Checks that only the set arrays tracked by the exercise are filled and that they all have the same length.
    Returns the set arrays to store: a list for every tracked field and None for every field the exercise does not track.
    """
    normalized = {}
    lengths = set()
    for field in SET_FIELDS:
        values = sets.get(field) or []
        if getattr(exercise, field):
            normalized[field] = values
            lengths.add(len(values))
        elif values:
            raise InvalidRepetitionCountError(f"Exercise with ID {exercise.id} does not track {field}.")
        else:
            normalized[field] = None

    if len(lengths) > 1:
        raise InvalidRepetitionCountError("All set arrays of an exercise must have the same length.")

    return normalized


def get_all_workouts(db: Session, user_id: int) -> WorkoutListResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    sync_time = crud.get_sync_time(db)
    db_workouts = crud.get_all_workouts_for_user(db, user_id)

    return WorkoutListResponse(
        workouts=[_map_workout(workout) for workout in db_workouts if workout.deleted_at is None],
        sync_time=to_iso(sync_time)
    )


def get_workout_delta(db: Session, user_id: int, last_sync_time: datetime) -> WorkoutDeltaResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    current_sync_time = crud.get_sync_time(db)
    last_sync_time = check_last_sync_time(db, last_sync_time)

    db_workouts = crud.get_workout_delta(db, user_id, last_sync_time)

    updates = []

    for workout in db_workouts:
        if workout.deleted_at:
            if workout.deleted_at < last_sync_time:
                continue # Deletion was already synced
            # Reported even if the workout was created after the last sync, since the client may have received it already
            action = 2  # Deleted
        else:
            action = 0 if workout.created_at >= last_sync_time else 1  # Created or updated

        mapped_exercises = []
        if action != 2:
            mapped_exercises = [_map_workout_exercise(ex) for ex in workout.exercises]

        updates.append(
            SingleWorkoutDeltaResponse(
                id=workout.id,
                client_uuid=workout.client_uuid,
                action=action,
                name=workout.name if action != 2 else None,
                date=to_iso(workout.date) if action != 2 else None,
                duration=workout.duration if action != 2 else None,
                in_progress=workout.in_progress if action != 2 else None,
                exercises=mapped_exercises
            )
        )

    return WorkoutDeltaResponse(
        updates=updates,
        sync_time=to_iso(current_sync_time)
    )


def create_workout(db: Session, user_id: int, payload: CreateWorkoutRequest) -> WorkoutResponse:
    """
    If the user already created a workout with the same client UUID, that workout is returned instead.
    """
    if payload.client_uuid is not None:
        # Locked, so that a concurrent retry of the same request waits and then finds the created workout
        crud.lock_user(db, user_id)
        existing_workout = crud.get_workout_by_client_uuid(db, user_id, payload.client_uuid)
        if existing_workout:
            return _map_workout(existing_workout)

    sets_by_exercise = []
    for exercise in payload.exercises:
        db_exercise = exercise_crud.get_usable_exercise_by_id(db, exercise.exercise_id, user_id)
        if not db_exercise:
            raise ExerciseNotFoundError(f"Exercise with ID {exercise.exercise_id} not found.")
        sets_by_exercise.append((exercise, _normalize_sets(db_exercise, exercise.model_dump())))

    db_workout = crud.create_workout(
        db=db,
        user_id=user_id,
        name=payload.name,
        date=payload.date,
        duration=payload.duration,
        in_progress=payload.in_progress,
        client_uuid=payload.client_uuid
    )
    db.flush()

    for exercise, sets in sorted(sets_by_exercise, key=lambda item: item[0].index):
        db_workout.exercises.append(
            crud.create_workout_exercise(
                db=db,
                workout_id=db_workout.id,
                exercise_id=exercise.exercise_id,
                unilateral=exercise.unilateral,
                index=exercise.index,
                client_uuid=exercise.client_uuid,
                **sets
            )
        )
    db.flush()

    return _map_workout(db_workout)


def _create_workout_exercise(db: Session, user_id: int, db_workout: Workout, change: CreateWorkoutExerciseChange) -> None:
    """
    Exercises at or after the index are moved back by one. If the workout already contains an exercise with the same
    client UUID, nothing is changed.
    """
    if change.client_uuid is not None:
        existing_exercise = crud.get_workout_exercise_by_client_uuid(db, db_workout.id, change.client_uuid)
        if existing_exercise:
            return

    db_exercise = exercise_crud.get_usable_exercise_by_id(db, change.exercise_id, user_id)
    if not db_exercise:
        raise ExerciseNotFoundError(f"Exercise with ID {change.exercise_id} not found.")
    sets = _normalize_sets(db_exercise, change.model_dump())

    existing_exercises = db_workout.exercises
    if len(existing_exercises) >= MAX_EXERCISES:
        raise InvalidWorkoutStateError(f"A workout can have at most {MAX_EXERCISES} exercises.")
    if change.index > len(existing_exercises):
        raise InvalidWorkoutStateError(f"Index must be between 0 and {len(existing_exercises)}.")

    for ex in existing_exercises:
        if ex.index >= change.index:
            ex.index += 1

    db_workout_exercise = crud.create_workout_exercise(
        db=db,
        workout_id=db_workout.id,
        exercise_id=change.exercise_id,
        unilateral=change.unilateral,
        index=change.index,
        client_uuid=change.client_uuid,
        **sets
    )
    # Added to the loaded collection, so that later changes of the same request see it
    db_workout.exercises.append(db_workout_exercise)

    db_workout.updated_at = func.now()
    db.flush()


def update_workout(db: Session, user_id: int, workout_id: int, payload: UpdateWorkoutRequest) -> WorkoutResponse:
    """
    First its fields, then the changes to its exercises in the given order. The workout is locked, so that concurrent
    changes to the exercise order are serialized.
    """
    db_workout = _get_owned_workout(db, user_id, workout_id, for_update=True)

    changes = payload.model_dump(exclude_unset=True, exclude={"exercise_changes"})
    if changes:
        for field, value in changes.items():
            setattr(db_workout, field, value)

        db_workout.updated_at = func.now()
        db.flush()

    for change in payload.exercise_changes:
        if isinstance(change, CreateWorkoutExerciseChange):
            _create_workout_exercise(db, user_id, db_workout, change)
        else:
            _update_workout_exercise(db, user_id, db_workout, change)

    return _map_workout(db_workout)


def _update_workout_exercise(db: Session, user_id: int, db_workout: Workout, change: UpdateWorkoutExerciseChange) -> None:
    """
    A changed index shifts the exercises in between. Exercises of other workouts are reported as not found.
    """
    db_workout_exercise = next((ex for ex in db_workout.exercises if ex.id == change.id), None)
    if not db_workout_exercise:
        raise WorkoutExerciseNotFoundError(f"Workout exercise with ID {change.id} not found.")

    changes = change.model_dump(exclude_unset=True, exclude={"op", "id"})

    if "exercise_id" in changes or any(field in changes for field in SET_FIELDS):
        if "exercise_id" in changes:
            db_exercise = exercise_crud.get_usable_exercise_by_id(db, changes["exercise_id"], user_id)
        else:
            # The current exercise may no longer be usable (e.g. deleted), but its tracked fields still apply
            db_exercise = exercise_crud.get_exercise_by_id(db, db_workout_exercise.exercise_id)
        if not db_exercise:
            raise ExerciseNotFoundError(f"Exercise with ID {changes.get('exercise_id', db_workout_exercise.exercise_id)} not found.")

        # All set arrays are replaced, so that fields the (new) exercise does not track become None
        changes.update(_normalize_sets(db_exercise, {
            field: changes[field] if field in changes else getattr(db_workout_exercise, field)
            for field in SET_FIELDS
        }))

    if "index" in changes:
        new_index = changes.pop("index")
        old_index = db_workout_exercise.index
        if new_index >= len(db_workout.exercises):
            raise InvalidWorkoutStateError(f"Index must be between 0 and {len(db_workout.exercises) - 1}.")

        for ex in db_workout.exercises:
            if ex is db_workout_exercise:
                continue
            if old_index < ex.index <= new_index:
                ex.index -= 1
            elif new_index <= ex.index < old_index:
                ex.index += 1
        db_workout_exercise.index = new_index
        has_changes = new_index != old_index
    else:
        has_changes = False

    if changes or has_changes:
        for field, value in changes.items():
            setattr(db_workout_exercise, field, value)

        db_workout.updated_at = func.now()
        db.flush()


def delete_workout(db: Session, user_id: int, workout_id: int) -> None:
    db_workout = _get_owned_workout(db, user_id, workout_id)

    db_workout.deleted_at = func.now()
    db.flush()


def delete_workout_exercise(db: Session, user_id: int, workout_exercise_id: int) -> None:
    """
    Closes the gap in the exercise order.
    """
    db_workout, db_workout_exercise = _get_owned_workout_exercise(db, user_id, workout_exercise_id)

    # Removing it from the collection deletes the row (delete-orphan cascade)
    db_workout.exercises.remove(db_workout_exercise)
    for ex in db_workout.exercises:
        if ex.index > db_workout_exercise.index:
            ex.index -= 1

    db_workout.updated_at = func.now()
    db.flush()
