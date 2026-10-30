from fastapi import APIRouter, Depends, Path, Request, status

from app.core.deps import get_current_user_id
from app.core.rate_limit import limiter
from app.schemas import ImageResponse
from app.services import image_service

router = APIRouter()


@router.get("/{image_hash}", status_code=status.HTTP_200_OK, response_class=ImageResponse)
@limiter.limit("600/minute")
def get_image(
    request: Request,
    image_hash: str = Path(..., pattern=r"^[0-9a-f]{64}$", description="The 64 character hash stored in the *_url fields."),
    user_id: int = Depends(get_current_user_id)
):
    """
    Returns a stored image as JPEG. Requires a logged-in user.
    Images never change under the same hash (a new upload gets a new hash), so clients can cache them forever.
    """
    return ImageResponse(image_service.get_image_path(image_hash))
