from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.db.models import User, Workout, WorkoutExercise, WorkoutScheme, WorkoutSchemeExercise
from app.db.queries.sync import get_sync_time  # noqa: F401 (re-exported for the workout services)


def lock_user(db: Session, user_id: int) -> None:
    """
    Locks the user row until the end of the transaction, to serialize checks
    like "no object with this client UUID yet" between concurrent requests of the same user.
    """
    db.query(User.id).filter(User.id == user_id).with_for_update().one()


def create_workout(
    db: Session,
    user_id: int,
    name: str,
    date: datetime,
    duration: int,
    in_progress: bool = True,
    client_uuid: UUID | None = None
) -> Workout:
    new_workout = Workout(
        client_uuid=client_uuid,
        user_id=user_id,
        name=name,
        date=date,
        duration=duration,
        in_progress=in_progress,
        created_at=func.now()
    )
    db.add(new_workout)
    return new_workout

def create_workout_exercise(
    db: Session,
    workout_id: int,
    exercise_id: int,
    unilateral: bool,
    index: int,
    reps: list[int] | None = None,
    weights: list[float] | None = None,
    time: list[int] | None = None,
    intensity: list[float] | None = None,
    distance: list[float] | None = None,
    client_uuid: UUID | None = None
) -> WorkoutExercise:
    new_exercise = WorkoutExercise(
        client_uuid=client_uuid,
        workout_id=workout_id,
        exercise_id=exercise_id,
        unilateral=unilateral,
        reps=reps,
        weights=weights,
        time=time,
        intensity=intensity,
        distance=distance,
        index=index
    )
    db.add(new_exercise)
    return new_exercise

def create_workout_scheme(
    db: Session,
    user_id: int,
    name: str,
    client_uuid: UUID | None = None
) -> WorkoutScheme:
    new_scheme = WorkoutScheme(
        client_uuid=client_uuid,
        user_id=user_id,
        name=name,
        created_at=func.now()
    )
    db.add(new_scheme)
    return new_scheme

def create_workout_scheme_exercise(
    db: Session,
    workout_scheme_id: int,
    exercise_id: int,
    index: int
) -> WorkoutSchemeExercise:
    new_scheme_exercise = WorkoutSchemeExercise(
        workout_scheme_id=workout_scheme_id,
        exercise_id=exercise_id,
        index=index
    )
    db.add(new_scheme_exercise)
    return new_scheme_exercise


def get_all_workouts_for_user(db: Session, user_id: int) -> list[Workout]:
    return (
        db.query(Workout)
        .options(joinedload(Workout.exercises))
        .filter(Workout.user_id == user_id)
        .all()
    )


def get_workout_delta(db: Session, user_id: int, last_sync_time: datetime) -> list[Workout]:
    """
    Including deleted ones. The comparison is inclusive, since changes with exactly the sync timestamp may not have been
    visible at the last sync.
    """
    return (
        db.query(Workout)
        .options(joinedload(Workout.exercises))
        .filter(
            Workout.user_id == user_id,
            or_(
                Workout.updated_at >= last_sync_time,
                Workout.created_at >= last_sync_time,
                Workout.deleted_at >= last_sync_time
            )
        )
        .all()
    )


def get_workout_by_id(db: Session, workout_id: int, for_update: bool = False) -> Workout | None:
    """
    for_update locks the row until the end of the transaction.
    """
    query = db.query(Workout).filter(Workout.id == workout_id)
    if for_update:
        query = query.with_for_update()
    return query.first()


def get_workout_by_client_uuid(db: Session, user_id: int, client_uuid: UUID) -> Workout | None:
    """
    Including deleted ones.
    """
    return db.query(Workout).filter(Workout.user_id == user_id, Workout.client_uuid == client_uuid).first()


def get_workout_exercise_by_client_uuid(db: Session, workout_id: int, client_uuid: UUID) -> WorkoutExercise | None:
    return (
        db.query(WorkoutExercise)
        .filter(WorkoutExercise.workout_id == workout_id, WorkoutExercise.client_uuid == client_uuid)
        .first()
    )


def get_workout_id_of_workout_exercise(db: Session, workout_exercise_id: int) -> int | None:
    """
    Only the ID is loaded, so that the workout can be locked before its exercises are loaded.
    """
    return (
        db.query(WorkoutExercise.workout_id)
        .filter(WorkoutExercise.id == workout_exercise_id)
        .scalar()
    )


def get_all_workout_schemes_for_user(db: Session, user_id: int) -> list[WorkoutScheme]:
    return (
        db.query(WorkoutScheme)
        .options(joinedload(WorkoutScheme.exercises))
        .filter(WorkoutScheme.user_id == user_id, WorkoutScheme.deleted_at.is_(None))
        .all()
    )


def get_workout_scheme_delta(db: Session, user_id: int, last_sync_time: datetime) -> list[WorkoutScheme]:
    """
    Including deleted ones. The comparison is inclusive, since changes with exactly the sync timestamp may not have been
    visible at the last sync.
    """
    return (
        db.query(WorkoutScheme)
        .options(joinedload(WorkoutScheme.exercises))
        .filter(
            WorkoutScheme.user_id == user_id,
            or_(
                WorkoutScheme.updated_at >= last_sync_time,
                WorkoutScheme.created_at >= last_sync_time,
                WorkoutScheme.deleted_at >= last_sync_time
            )
        )
        .all()
    )


def get_workout_scheme_by_id(db: Session, workout_scheme_id: int, for_update: bool = False) -> WorkoutScheme | None:
    """
    for_update locks the row until the end of the transaction.
    """
    query = db.query(WorkoutScheme).filter(WorkoutScheme.id == workout_scheme_id)
    if for_update:
        query = query.with_for_update()
    return query.first()


def get_workout_scheme_by_client_uuid(db: Session, user_id: int, client_uuid: UUID) -> WorkoutScheme | None:
    """
    Including deleted ones.
    """
    return (
        db.query(WorkoutScheme)
        .filter(WorkoutScheme.user_id == user_id, WorkoutScheme.client_uuid == client_uuid)
        .first()
    )
