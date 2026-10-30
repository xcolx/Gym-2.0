from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import (
    CreateExerciseRequest,
    EquipmentResponse,
    ExerciseDeltaResponse,
    ExerciseListResponse,
    ExerciseResponse,
    MuscleGroupResponse,
    MuscleResponse,
)
from app.services import exercise_service, image_service

router = APIRouter()


def exercise_form(
    client_uuid: UUID | None = Form(None),
    name: str = Form(...),
    description: str | None = Form(None),
    aliases: list[str] = Form([]),
    muscle_group_id: int = Form(...),
    equipment_id: int = Form(...),
    primary_muscle_ids: list[int] = Form([]),
    secondary_muscle_ids: list[int] = Form([]),
    reps: bool = Form(...),
    weights: bool = Form(...),
    time: bool = Form(...),
    intensity: bool = Form(...),
    distance: bool = Form(...)
) -> CreateExerciseRequest:
    """
    Reads the exercise fields from multipart/form-data and validates them with CreateExerciseRequest.
    The fields are declared one by one, since a form model cannot be combined with a file parameter.
    """
    try:
        return CreateExerciseRequest(
            client_uuid=client_uuid,
            name=name,
            description=description,
            aliases=aliases,
            muscle_group_id=muscle_group_id,
            equipment_id=equipment_id,
            primary_muscle_ids=primary_muscle_ids,
            secondary_muscle_ids=secondary_muscle_ids,
            reps=reps,
            weights=weights,
            time=time,
            intensity=intensity,
            distance=distance
        )
    except ValidationError as e:
        raise RequestValidationError(
            [{**error, "loc": ("body", *error["loc"])} for error in e.errors(include_url=False, include_context=False)]
        ) from e

def _read_images(images: list[UploadFile] | None) -> list[bytes]:
    # Checked before reading, so that a request with many files is not loaded into memory
    exercise_service.check_image_count(len(images or []))
    return [image_service.read_upload(image.file) for image in images or []]

@router.get("", status_code=status.HTTP_200_OK, response_model=ExerciseListResponse)
@limiter.limit("10/minute")
def get_all(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all non-deleted exercises that are verified or were created by the current user,
    together with the sync_time to pass to /exercises/delta for the next sync.
    """
    return exercise_service.get_all_exercises(db, user.id)


@router.get("/delta", status_code=status.HTTP_200_OK, response_model=ExerciseDeltaResponse)
@limiter.limit("20/minute")
def get_delta(
    request: Request,
    last_sync_time: datetime,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves exercises that have been created or updated since the provided timestamp.
    A last_sync_time older than 28 days is rejected with 400 (SyncTimeExpiredError): load everything with GET /exercises instead.
    """
    return exercise_service.get_exercise_delta(db, user.id, last_sync_time)


@router.get("/equipment", status_code=status.HTTP_200_OK, response_model=list[EquipmentResponse])
@limiter.limit("20/minute")
def get_equipment(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return exercise_service.get_all_equipment(db)


@router.get("/muscle-groups", status_code=status.HTTP_200_OK, response_model=list[MuscleGroupResponse])
@limiter.limit("20/minute")
def get_muscle_groups(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return exercise_service.get_all_muscle_groups(db)


@router.get("/muscles", status_code=status.HTTP_200_OK, response_model=list[MuscleResponse])
@limiter.limit("20/minute")
def get_muscles(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return exercise_service.get_all_muscles(db)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ExerciseResponse)
@limiter.limit("100/minute")
def create_exercise(
    request: Request,
    payload: CreateExerciseRequest = Depends(exercise_form),
    images: list[UploadFile] | None = File(None),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Creates a new exercise with the provided details and images. The exercise is associated with the current user and is unverified by default.
    Uses multipart/form-data, primary_muscle_ids, secondary_muscle_ids, aliases and the image files are sent as repeated form fields,
    the images are shown in the order they are sent.
    """
    return exercise_service.create_exercise(db, payload, user.id, _read_images(images))

@router.put("/{exercise_id}", status_code=status.HTTP_200_OK, response_model=ExerciseResponse)
@limiter.limit("100/minute")
def update_exercise(
    request: Request,
    exercise_id: int,
    payload: CreateExerciseRequest = Depends(exercise_form),
    image_urls: list[str] = Form([]),
    images: list[UploadFile] | None = File(None),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Updates an existing exercise with the provided details. Only the creator of an unverified exercise
    can update it. The tracked metrics can only be changed as long as the exercise is not part of a workout.
    Uses multipart/form-data, primary_muscle_ids, secondary_muscle_ids, aliases, image_urls and the image files are sent as repeated form fields.
    The images become the stored images listed in image_urls (in that order) followed by the uploaded images,
    stored images that are not listed are removed.
    """
    return exercise_service.update_exercise(db, exercise_id, payload, user.id, image_urls, _read_images(images))

@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("100/minute")
def delete_exercise(
    request: Request,
    exercise_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Deletes an existing exercise. Only the creator of an unverified exercise can delete it,
    and only as long as the exercise is not part of a workout or workout scheme.
    """
    exercise_service.soft_delete_exercise(db, exercise_id, user.id)
