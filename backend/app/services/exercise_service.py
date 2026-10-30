from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import app.db.queries.exercises as crud
from app.core.errors import ExerciseCreationError, ExerciseInUseError, ExerciseNotFoundError, PermissionDeniedError
from app.db.models import Exercise
from app.db.queries.sync import check_last_sync_time
from app.db.queries.workouts import lock_user
from app.schemas import (
    CreateExerciseRequest,
    EquipmentResponse,
    ExerciseDeltaResponse,
    ExerciseListResponse,
    ExerciseResponse,
    MuscleGroupResponse,
    MuscleResponse,
    SingleExerciseDeltaResponse,
)
from app.services import image_service
from app.util.time import to_iso

EXERCISE_IMAGE_QUALITY = 85
EXERCISE_IMAGE_MAX_DIMENSION = 1280
# An exercise is explained by a series of images, e.g. one per keyframe of the movement
MAX_EXERCISE_IMAGES = 10


def _validate_exercise_references(db: Session, payload: CreateExerciseRequest) -> None:
    """
    Also ensures that no muscle is listed twice.
    """
    if not crud.muscle_group_exists(db, payload.muscle_group_id):
        raise ExerciseCreationError(f"Muscle group with ID {payload.muscle_group_id} does not exist.")
    if not crud.equipment_exists(db, payload.equipment_id):
        raise ExerciseCreationError(f"Equipment with ID {payload.equipment_id} does not exist.")

    all_muscle_ids = payload.primary_muscle_ids + payload.secondary_muscle_ids
    if len(all_muscle_ids) != len(set(all_muscle_ids)):
        raise ExerciseCreationError("A muscle can only be listed once, either as primary or as secondary muscle.")

    missing_ids = set(all_muscle_ids) - crud.get_existing_muscle_ids(db, all_muscle_ids)
    if missing_ids:
        raise ExerciseCreationError(f"Muscles with IDs {sorted(missing_ids)} do not exist.")


def check_image_count(count: int) -> None:
    if count > MAX_EXERCISE_IMAGES:
        raise ExerciseCreationError(f"An exercise can have at most {MAX_EXERCISE_IMAGES} images.")


def _store_images(db: Session, image_contents: list[bytes]) -> list[str]:
    return [
        image_service.store_image(db, contents, quality=EXERCISE_IMAGE_QUALITY, max_dimension=EXERCISE_IMAGE_MAX_DIMENSION)
        for contents in image_contents
    ]


def _get_editable_exercise(db: Session, exercise_id: int, user_id: int, action: str, check_in_use: bool = True) -> Exercise:
    """
    Retrieves and locks a non-deleted exercise that the user is allowed to change.
    Unverified exercises of other users are reported as not found, so that existing IDs cannot be probed.
    Exercises that are part of a non-deleted workout or workout scheme cannot be deleted, unless check_in_use is False.
    """
    exercise = crud.get_exercise_by_id(db, exercise_id, for_update=True)

    if not exercise or exercise.deleted_at is not None or (not exercise.verified and exercise.user_id != user_id):
        raise ExerciseNotFoundError(f"Exercise with ID {exercise_id} not found.")
    if exercise.user_id != user_id or exercise.verified:
        raise PermissionDeniedError(f"You do not have permission to {action} this exercise.")
    if check_in_use and crud.is_exercise_used_in_workouts(db, exercise_id):
        raise ExerciseInUseError(f"The exercise cannot be {action}d because it is part of a workout.")
    if check_in_use and crud.is_exercise_used_in_workout_schemes(db, exercise_id):
        raise ExerciseInUseError(f"The exercise cannot be {action}d because it is part of a workout scheme.")

    return exercise


def _map_exercise(exercise: Exercise, user_id: int) -> ExerciseResponse:
    """
    The client UUID is only included for exercises of the user.
    """
    return ExerciseResponse(
        id=exercise.id,
        client_uuid=exercise.client_uuid if exercise.user_id == user_id else None,
        name=exercise.name,
        description=exercise.description,
        aliases=exercise.aliases,
        image_urls=exercise.image_urls,
        muscle_group_id=exercise.muscle_group_id,
        equipment_id=exercise.equipment_id,
        verified=exercise.verified,
        reps=exercise.reps,
        weights=exercise.weights,
        time=exercise.time,
        intensity=exercise.intensity,
        distance=exercise.distance,
        primary_muscle_ids=[em.muscle_id for em in exercise.exercise_muscles if em.is_primary],
        secondary_muscle_ids=[em.muscle_id for em in exercise.exercise_muscles if not em.is_primary]
    )


def get_all_exercises(db: Session, user_id: int) -> ExerciseListResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    sync_time = crud.get_sync_time(db)
    exercises = crud.get_all_exercises_for_user(db, user_id)

    return ExerciseListResponse(
        exercises=[_map_exercise(exercise, user_id) for exercise in exercises],
        sync_time=to_iso(sync_time)
    )


def get_exercise_delta(db, user_id: int, last_sync_time: datetime) -> ExerciseDeltaResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    current_sync_time = crud.get_sync_time(db)
    last_sync_time = check_last_sync_time(db, last_sync_time)

    exercises = crud.get_exercise_delta(db, user_id, last_sync_time)

    response_list = []

    for exercise in exercises:
        if exercise.deleted_at:
            if exercise.deleted_at < last_sync_time:
                continue # Deletion was already synced
            # Reported even if the exercise was created after the last sync, since the client may have received it already
            action = 2  # Deleted
        else:
            action = 0 if exercise.created_at >= last_sync_time else 1  # Created or updated

        response_list.append(
            SingleExerciseDeltaResponse(
                action=action,
                **_map_exercise(exercise, user_id).model_dump()
            )
        )

    return ExerciseDeltaResponse(
        updates=response_list,
        sync_time=to_iso(current_sync_time)
    )


def create_exercise(db: Session, payload: CreateExerciseRequest, user_id: int, image_contents: list[bytes]) -> ExerciseResponse:
    """
    The images are shown in the order they were uploaded. If the user already created an exercise with the same client
    UUID, that exercise is returned instead.
    """
    if payload.client_uuid is not None:
        # Locked, so that a concurrent retry of the same request waits and then finds the created exercise
        lock_user(db, user_id)
        existing_exercise = crud.get_exercise_by_client_uuid(db, user_id, payload.client_uuid)
        if existing_exercise:
            return _map_exercise(existing_exercise, user_id)

    _validate_exercise_references(db, payload)
    check_image_count(len(image_contents))
    image_hashes = _store_images(db, image_contents)

    exercise_data = {
        "client_uuid": payload.client_uuid,
        "name": payload.name,
        "description": payload.description,
        "aliases": payload.aliases,
        "image_urls": image_hashes,
        "muscle_group_id": payload.muscle_group_id,
        "equipment_id": payload.equipment_id,
        "reps": payload.reps,
        "weights": payload.weights,
        "time": payload.time,
        "intensity": payload.intensity,
        "distance": payload.distance,
        "user_id": user_id,
        "verified": False,
        "created_at": func.now()
    }

    db_exercise = crud.create_exercise(db, exercise_data)
    db.flush()

    crud.create_exercise_muscles(
        db=db,
        exercise_id=db_exercise.id,
        primary_ids=payload.primary_muscle_ids,
        secondary_ids=payload.secondary_muscle_ids
    )

    db.refresh(db_exercise)

    return ExerciseResponse(
        id=db_exercise.id,
        client_uuid=db_exercise.client_uuid,
        name=db_exercise.name,
        description=db_exercise.description,
        aliases=db_exercise.aliases,
        image_urls=db_exercise.image_urls,
        muscle_group_id=db_exercise.muscle_group_id,
        equipment_id=db_exercise.equipment_id,
        verified=db_exercise.verified,
        reps=db_exercise.reps,
        weights=db_exercise.weights,
        intensity=db_exercise.intensity,
        time=db_exercise.time,
        distance=db_exercise.distance,
        primary_muscle_ids=payload.primary_muscle_ids,
        secondary_muscle_ids=payload.secondary_muscle_ids
    )


def update_exercise(
    db: Session, exercise_id: int, payload: CreateExerciseRequest, user_id: int,
    kept_image_urls: list[str], image_contents: list[bytes]
) -> ExerciseResponse:
    """
    The tracked metrics can only be changed as long as the exercise is not part of a workout, since the set data of
    those workouts depends on them. The images become the stored images listed in kept_image_urls (in that order)
    followed by the uploaded ones. Hashes that are not images of the exercise are ignored, e.g. the ones of a client
    that hasn't received an earlier change yet.
    """
    exercise = _get_editable_exercise(db, exercise_id, user_id, "update", check_in_use=False)

    metrics_changed = (exercise.reps, exercise.weights, exercise.time, exercise.intensity, exercise.distance) != \
        (payload.reps, payload.weights, payload.time, payload.intensity, payload.distance)
    if metrics_changed and crud.is_exercise_used_in_workouts(db, exercise_id):
        raise ExerciseInUseError("The tracked metrics of the exercise cannot be changed because it is part of a workout.")

    _validate_exercise_references(db, payload)

    kept = list(dict.fromkeys(image_hash for image_hash in kept_image_urls if image_hash in exercise.image_urls))
    check_image_count(len(kept) + len(image_contents))
    for image_hash in exercise.image_urls:
        if image_hash not in kept:
            image_service.discard_image(db, image_hash)
    exercise.image_urls = kept + _store_images(db, image_contents)

    update_data = {
        "name": payload.name,
        "description": payload.description,
        "aliases": payload.aliases,
        "muscle_group_id": payload.muscle_group_id,
        "equipment_id": payload.equipment_id,
        "reps": payload.reps,
        "weights": payload.weights,
        "time": payload.time,
        "intensity": payload.intensity,
        "distance": payload.distance,
        "updated_at": func.now()
    }

    for key, value in update_data.items():
        setattr(exercise, key, value)

    crud.delete_exercise_muscles(db, exercise_id)
    crud.create_exercise_muscles(db, exercise_id, payload.primary_muscle_ids, payload.secondary_muscle_ids)

    db.flush()
    db.refresh(exercise)

    return ExerciseResponse(
        id=exercise.id,
        client_uuid=exercise.client_uuid,
        name=exercise.name,
        description=exercise.description,
        aliases=exercise.aliases,
        image_urls=exercise.image_urls,
        muscle_group_id=exercise.muscle_group_id,
        equipment_id=exercise.equipment_id,
        verified=exercise.verified,
        reps=exercise.reps,
        weights=exercise.weights,
        intensity=exercise.intensity,
        time=exercise.time,
        distance=exercise.distance,
        primary_muscle_ids=payload.primary_muscle_ids,
        secondary_muscle_ids=payload.secondary_muscle_ids
    )


def soft_delete_exercise(db: Session, exercise_id: int, user_id: int):
    exercise = _get_editable_exercise(db, exercise_id, user_id, "delete")

    exercise.deleted_at = func.now()
    for image_hash in exercise.image_urls:
        image_service.discard_image(db, image_hash)
    db.flush()


def get_all_equipment(db: Session) -> list[EquipmentResponse]:
    return [EquipmentResponse.model_validate(equipment) for equipment in crud.get_all_equipment(db)]


def get_all_muscle_groups(db: Session) -> list[MuscleGroupResponse]:
    return [MuscleGroupResponse.model_validate(muscle_group) for muscle_group in crud.get_all_muscle_groups(db)]


def get_all_muscles(db: Session) -> list[MuscleResponse]:
    return [MuscleResponse.model_validate(muscle) for muscle in crud.get_all_muscles(db)]
