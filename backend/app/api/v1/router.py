from fastapi import APIRouter

from app.api.v1.endpoints import (
    ai,
    auth,
    chat,
    exercises,
    health,
    images,
    reports,
    users,
    workout_exercises,
    workout_schemes,
    workouts,
)

api_router = APIRouter()

api_router.include_router(ai.router, prefix="/ai/conversations", tags=["AI"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(chat.router, prefix="/chats", tags=["Chat"])
api_router.include_router(exercises.router, prefix="/exercises", tags=["Exercises"])
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(images.router, prefix="/images", tags=["Images"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(workouts.router, prefix="/workouts", tags=["Workouts"])
api_router.include_router(workout_exercises.router, prefix="/workout-exercises", tags=["Workouts"])
api_router.include_router(workout_schemes.router, prefix="/workout-schemes", tags=["Workout Schemes"])
