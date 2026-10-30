import io

import pytest
from conftest import image_file_exists, png_bytes
from PIL import Image
from sqlalchemy import text

from app.core.errors import ImageNotFoundError, ImageTooLargeError, InvalidImageError
from app.services import image_service


def test_decode_fills_transparency_with_white():
    image = image_service.decode_image(png_bytes((4, 4), (0, 0, 0, 0)))

    assert image.mode == "RGB"
    assert image.getpixel((0, 0)) == (255, 255, 255)


@pytest.mark.parametrize("contents, error", [
    (b"", InvalidImageError),
    (b"GIF89a not allowed", InvalidImageError),
    (png_bytes()[:40], InvalidImageError),
])
def test_decode_rejects_invalid_images(contents, error):
    with pytest.raises(error):
        image_service.decode_image(contents)


def test_decode_rejects_gif_even_if_valid():
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, "GIF")

    with pytest.raises(InvalidImageError):
        image_service.decode_image(buffer.getvalue())


def test_decode_rejects_too_many_pixels(monkeypatch):
    monkeypatch.setattr(image_service.settings, "IMAGE_MAX_PIXELS", 100)

    with pytest.raises(ImageTooLargeError):
        image_service.decode_image(png_bytes((20, 20)))


def test_read_upload_rejects_large_files(monkeypatch):
    monkeypatch.setattr(image_service.settings, "IMAGE_MAX_UPLOAD_BYTES", 10)

    with pytest.raises(ImageTooLargeError):
        image_service.read_upload(io.BytesIO(b"x" * 11))
    assert image_service.read_upload(io.BytesIO(b"x" * 10)) == b"x" * 10


def test_written_images_are_scaled_jpegs():
    image_hash = image_service.write_image(
        image_service.decode_image(png_bytes((400, 200))), quality=80, max_dimension=100
    )
    icon_hash = image_service.write_image(
        image_service.decode_image(png_bytes((400, 200))), quality=80, max_dimension=50, square=True
    )

    with Image.open(image_service.get_image_path(image_hash)) as image:
        assert image.format == "JPEG" and image.size == (100, 50)
    with Image.open(image_service.get_image_path(icon_hash)) as icon:
        assert icon.size == (50, 50)


def test_stored_image_is_removed_on_rollback(db):
    db.execute(text("SELECT 1"))  # Like in a request, the session is in a transaction
    image_hash = image_service.store_image(db, png_bytes(), quality=80, max_dimension=64)
    assert image_file_exists(image_hash)

    db.rollback()

    assert not image_file_exists(image_hash)


def test_stored_image_is_kept_on_commit(db):
    db.execute(text("SELECT 1"))  # Like in a request, the session is in a transaction
    image_hash = image_service.store_image(db, png_bytes(), quality=80, max_dimension=64)

    db.commit()

    assert image_file_exists(image_hash)


def test_discarded_image_is_removed_only_on_commit(db):
    db.execute(text("SELECT 1"))  # Like in a request, the session is in a transaction
    image_hash = image_service.write_image(image_service.decode_image(png_bytes()), quality=80, max_dimension=64)

    image_service.discard_image(db, image_hash)
    db.rollback()
    assert image_file_exists(image_hash)

    db.execute(text("SELECT 1"))
    image_service.discard_image(db, image_hash)
    db.commit()
    assert not image_file_exists(image_hash)


def test_get_image_path_validates_hash():
    with pytest.raises(ImageNotFoundError):
        image_service.get_image_path("../../etc/passwd")
    with pytest.raises(ImageNotFoundError):
        image_service.get_image_path("0" * 64)
