from fastapi.responses import FileResponse


class ImageResponse(FileResponse):
    """
    A stored image, always a JPEG. Images never change under the same hash (a new upload gets a new hash),
    so clients may cache them forever.
    """
    media_type = "image/jpeg"

    def __init__(self, path, **kwargs):
        super().__init__(path, headers={"Cache-Control": "private, max-age=31536000, immutable"}, **kwargs)
