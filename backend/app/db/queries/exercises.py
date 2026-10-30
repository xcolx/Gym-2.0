from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, exists, or_, select, true
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    Equipment,
    Exercise,
    ExerciseMuscle,
    Muscle,
    MuscleGroup,
    Workout,
    WorkoutExercise,
    WorkoutScheme,
    WorkoutSchemeExercise,
)
from app.db.queries.sync import get_sync_time  # noqa: F401 (re-exported for the exercise service)


def create_exercise(db: Session, exercise_data: dict) -> Exercise:
    db_exercise = Exercise(**exercise_data)
    db.add(db_exercise)
    return db_exercise


def create_exercise_muscles(db: Session, exercise_id: int, primary_ids: list[int], secondary_ids: list[int]) -> None:
    junction_records = []

    for muscle_id in primary_ids:
        junction_records.append(
            ExerciseMuscle(exercise_id=exercise_id, muscle_id=muscle_id, is_primary=True)
        )

    for muscle_id in secondary_ids:
        junction_records.append(
            ExerciseMuscle(exercise_id=exercise_id, muscle_id=muscle_id, is_primary=False)
        )

    if junction_records:
        db.bulk_save_objects(junction_records)


def get_all_exercises_for_user(db: Session, user_id: int) -> list[Exercise]:
    """
    Non-deleted exercises that are verified or were created by the user.
    """
    return (
        db.query(Exercise)
        .options(joinedload(Exercise.exercise_muscles))
        .filter(
            Exercise.deleted_at.is_(None),
            or_(
                Exercise.verified == true(),
                Exercise.user_id == user_id
            )
        )
        .all()
    )

def get_exercise_delta(db: Session, user_id: int, last_sync_time: datetime) -> list[Exercise]:
    """
    Including deleted ones. The comparison is inclusive, since changes with exactly the sync timestamp may not have been
    visible at the last sync.
    """
    return (
        db.query(Exercise)
        .options(joinedload(Exercise.exercise_muscles))
        .filter(
            or_(
                Exercise.updated_at >= last_sync_time,
                Exercise.created_at >= last_sync_time,
                Exercise.deleted_at >= last_sync_time
            ),
            or_(
                Exercise.verified == true(),
                Exercise.user_id == user_id
            )
        )
        .all()
    )


def get_exercise_by_id(db: Session, exercise_id: int, for_update: bool = False) -> Exercise | None:
    """
    for_update locks the row until the end of the transaction.
    """
    query = db.query(Exercise).filter(Exercise.id == exercise_id)
    if for_update:
        query = query.with_for_update()
    return query.first()


def get_exercise_by_client_uuid(db: Session, user_id: int, client_uuid: UUID) -> Exercise | None:
    """
    Including deleted ones.
    """
    return (
        db.query(Exercise)
        .options(joinedload(Exercise.exercise_muscles))
        .filter(Exercise.user_id == user_id, Exercise.client_uuid == client_uuid)
        .first()
    )


def get_usable_exercise_by_id(db: Session, exercise_id: int, user_id: int) -> Exercise | None:
    """
    Only if the user may use it (verified or created by the user). The row is share-locked until the end of the
    transaction, so that the exercise can't be changed or deleted while it's being added to a workout.
    """
    return (
        db.query(Exercise)
        .filter(
            Exercise.id == exercise_id,
            Exercise.deleted_at.is_(None),
            or_(
                Exercise.verified == true(),
                Exercise.user_id == user_id
            )
        )
        .with_for_update(read=True)
        .first()
    )


def is_exercise_used_in_workouts(db: Session, exercise_id: int) -> bool:
    return db.query(
        exists().where(
            WorkoutExercise.exercise_id == exercise_id,
            WorkoutExercise.workout_id == Workout.id,
            Workout.deleted_at.is_(None)
        )
    ).scalar()


def is_exercise_used_in_workout_schemes(db: Session, exercise_id: int) -> bool:
    return db.query(
        exists().where(
            WorkoutSchemeExercise.exercise_id == exercise_id,
            WorkoutSchemeExercise.workout_scheme_id == WorkoutScheme.id,
            WorkoutScheme.deleted_at.is_(None)
        )
    ).scalar()


def get_all_equipment(db: Session) -> list[Equipment]:
    return db.query(Equipment).order_by(Equipment.id).all()


def get_all_muscle_groups(db: Session) -> list[MuscleGroup]:
    return db.query(MuscleGroup).order_by(MuscleGroup.id).all()


def get_all_muscles(db: Session) -> list[Muscle]:
    return db.query(Muscle).order_by(Muscle.id).all()


def get_existing_muscle_ids(db: Session, muscle_ids: list[int]) -> set[int]:
    if not muscle_ids:
        return set()
    return set(db.scalars(select(Muscle.id).where(Muscle.id.in_(muscle_ids))).all())


def muscle_group_exists(db: Session, muscle_group_id: int) -> bool:
    return db.get(MuscleGroup, muscle_group_id) is not None


def equipment_exists(db: Session, equipment_id: int) -> bool:
    return db.get(Equipment, equipment_id) is not None


def delete_exercise_muscles(db: Session, exercise_id: int) -> None:
    db.execute(delete(ExerciseMuscle).where(ExerciseMuscle.exercise_id == exercise_id))
