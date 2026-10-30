"""
Inserts the exercise catalog the end-to-end tests use (the migrations don't insert one), once.
Run with the backend's Python and DATABASE_URL, see playwright.config.ts.
"""

from datetime import UTC, datetime

from sqlalchemy import select

from app.db.session import SessionLocal
from app.db.models import Equipment, Exercise, ExerciseMuscle, Muscle, MuscleGroup

with SessionLocal() as session:
    if session.scalar(select(Exercise).where(Exercise.name == "Bench Press", Exercise.user_id.is_(None))) is None:
        group, equipment = MuscleGroup(name="Chest"), Equipment(name="Barbell")
        muscle = Muscle(name="Pectoralis", image_url="0" * 64)
        session.add_all([group, equipment, muscle])
        session.flush()
        for name in ("Bench Press", "Push Up"):
            exercise = Exercise(
                name=name, muscle_group_id=group.id, equipment_id=equipment.id, verified=True,
                reps=True, weights=name == "Bench Press", time=False, intensity=False, distance=False,
                created_at=datetime.now(UTC),
            )
            session.add(exercise)
            session.flush()
            session.add(ExerciseMuscle(exercise_id=exercise.id, muscle_id=muscle.id, is_primary=True))
        session.commit()
