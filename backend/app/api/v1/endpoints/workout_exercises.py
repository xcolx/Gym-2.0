from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.services import workout_service

router = APIRouter()

# Workout exercises are created and updated through PATCH /workouts/{workout_id} (exercise_changes)

@router.delete("/{workout_exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("300/minute")
def delete_workout_exercise(
    request: Request,
    workout_exercise_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    workout_service.delete_workout_exercise(db, user.id, workout_exercise_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
