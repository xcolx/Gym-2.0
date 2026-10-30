import io
import logging
import os
import re
import secrets
from pathlib import Path
from typing import BinaryIO, TypeGuard

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ImageNotFoundError, ImageTooLargeError, InvalidImageError

# Central storage for all uploaded images. Every image is re-encoded as JPEG (which also strips EXIF data like GPS
# positions) and stored under a random 64 character hex hash, which is the only thing the database keeps.
# Like git objects, the first two characters of the hash are the subdirectory:
#   <IMAGE_STORAGE_PATH>/3f/a9c1...e7.jpg
# Every hash is referenced by exactly one row, so replaced or deleted images are removed for good once the change is
# committed.

register_heif_opener()
Image.MAX_IMAGE_PIXELS = settings.IMAGE_MAX_PIXELS

logger = logging.getLogger(__name__)

ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP", "HEIF")
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")

# session.info keys of the images written / discarded during the current transaction
_WRITTEN_KEY = "images_written"
_DISCARDED_KEY = "images_discarded"


def _storage_root() -> Path:
    return Path(settings.IMAGE_STORAGE_PATH)


def _relative_path(image_hash: str) -> Path:
    return Path(image_hash[:2]) / f"{image_hash[2:]}.jpg"


def is_valid_hash(value: str | None) -> TypeGuard[str]:
    return value is not None and HASH_PATTERN.match(value) is not None


def read_upload(file: BinaryIO) -> bytes:
    """
    Reads an uploaded file, but at most IMAGE_MAX_UPLOAD_BYTES, so that oversized uploads are not loaded into memory completely.
    """
    contents = file.read(settings.IMAGE_MAX_UPLOAD_BYTES + 1)
    if len(contents) > settings.IMAGE_MAX_UPLOAD_BYTES:
        raise ImageTooLargeError(f"Images cannot be larger than {settings.IMAGE_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    return contents


def decode_image(contents: bytes) -> Image.Image:
    """
    Checks that the contents are a supported image (detected from the data itself, not the file name or content type)
    and decodes it into an upright RGB image. Transparent areas are filled with white, since JPEG has no alpha channel.
    """
    if not contents:
        raise InvalidImageError("The uploaded image is empty.")
    if len(contents) > settings.IMAGE_MAX_UPLOAD_BYTES:
        raise ImageTooLargeError(f"Images cannot be larger than {settings.IMAGE_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")

    try:
        image: Image.Image = Image.open(io.BytesIO(contents), formats=ALLOWED_FORMATS)
        width, height = image.size
        if width * height > settings.IMAGE_MAX_PIXELS:
            raise ImageTooLargeError(f"Images cannot have more than {settings.IMAGE_MAX_PIXELS} pixels.")
        image.load()
    except Image.DecompressionBombError as error:
        raise ImageTooLargeError(f"Images cannot have more than {settings.IMAGE_MAX_PIXELS} pixels.") from error
    except (OSError, ValueError, SyntaxError) as error:
        # Unidentified formats and truncated or corrupt files
        raise InvalidImageError("Unsupported or corrupt image. Allowed formats are JPEG, PNG, WebP and HEIC.") from error

    icc_profile = image.info.get("icc_profile")
    image = ImageOps.exif_transpose(image)

    if "A" in image.getbands() or "transparency" in image.info:
        rgba = image.convert("RGBA")
        image = Image.new("RGB", rgba.size, (255, 255, 255))
        image.paste(rgba, mask=rgba.getchannel("A"))
    elif image.mode != "RGB":
        image = image.convert("RGB")

    # Keeps colors of wide gamut photos (e.g. Display P3 on iPhones) correct
    if icc_profile:
        image.info["icc_profile"] = icc_profile
    return image


def write_image(image: Image.Image, *, quality: int, max_dimension: int, square: bool = False) -> str:
    """
    Compresses the image as JPEG, writes it to the storage and returns its new hash.
    quality: JPEG quality from 1 (smallest file) to 95 (best quality).
    max_dimension: the longer side is scaled down to this size, smaller images are never scaled up.
    square: center-crops the image to a max_dimension x max_dimension square instead (e.g. for icons).
    Does not track the file in a database transaction, services should use store_image instead.
    """
    if not 1 <= quality <= 95:
        raise ValueError("quality must be between 1 and 95.")
    if max_dimension < 1:
        raise ValueError("max_dimension must be positive.")

    if square:
        output = ImageOps.fit(image, (max_dimension, max_dimension), Image.Resampling.LANCZOS)
    else:
        output = image.copy()
        output.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    output.save(
        buffer, "JPEG",
        quality=quality, optimize=True, progressive=True,
        icc_profile=image.info.get("icc_profile")
    )

    image_hash = secrets.token_hex(32)
    path = _storage_root() / _relative_path(image_hash)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Written to a temporary file first, so that a crash never leaves a half written image behind
    temp_path = path.with_suffix(".tmp")
    temp_path.write_bytes(buffer.getvalue())
    os.replace(temp_path, path)

    return image_hash


def delete_image_file(image_hash: str | None) -> None:
    """
    Removes a stored image for good right away. Missing files and invalid hashes are ignored.
    Does not wait for a database transaction, services should use discard_image instead.
    """
    if not is_valid_hash(image_hash):
        return

    try:
        (_storage_root() / _relative_path(image_hash)).unlink()
    except FileNotFoundError:
        logger.warning("Image %s to delete does not exist.", image_hash)
    except OSError:
        logger.exception("Failed to delete image %s.", image_hash)


def store_image(
    db: Session,
    image: bytes | Image.Image,
    *,
    quality: int,
    max_dimension: int,
    square: bool = False
) -> str:
    """
    Validates, compresses and stores an image (raw upload bytes or an image from decode_image) and returns its hash.
    See write_image for the parameters. If the transaction of db is rolled back, the file is removed again,
    so that no unreferenced images are left behind.
    """
    if isinstance(image, bytes):
        image = decode_image(image)

    image_hash = write_image(image, quality=quality, max_dimension=max_dimension, square=square)
    db.info.setdefault(_WRITTEN_KEY, []).append(image_hash)
    return image_hash


def copy_image(db: Session, image_hash: str | None) -> str | None:
    """
    Stores a copy of a stored image under a new hash and returns it, so that another row can own the same picture
    (e.g. a report keeps it after the original was deleted). Returns None for None or an image that doesn't exist.
    Like store_image, the copy is removed again if the transaction of db is rolled back.
    """
    if not is_valid_hash(image_hash):
        return None
    try:
        contents = (_storage_root() / _relative_path(image_hash)).read_bytes()
    except FileNotFoundError:
        logger.warning("Image %s to copy does not exist.", image_hash)
        return None

    new_hash = secrets.token_hex(32)
    path = _storage_root() / _relative_path(new_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_bytes(contents)
    os.replace(temp_path, path)

    db.info.setdefault(_WRITTEN_KEY, []).append(new_hash)
    return new_hash


def discard_image(db: Session, image_hash: str | None) -> None:
    """
    Removes a replaced or deleted image for good once the transaction of db is committed.
    If the transaction is rolled back, the image is kept. None is ignored.
    """
    if image_hash:
        db.info.setdefault(_DISCARDED_KEY, []).append(image_hash)


@event.listens_for(Session, "after_commit")
def _on_commit(session: Session) -> None:
    session.info.pop(_WRITTEN_KEY, None)
    for image_hash in session.info.pop(_DISCARDED_KEY, []):
        delete_image_file(image_hash)


@event.listens_for(Session, "after_rollback")
def _on_rollback(session: Session) -> None:
    session.info.pop(_DISCARDED_KEY, None)
    for image_hash in session.info.pop(_WRITTEN_KEY, []):
        delete_image_file(image_hash)


def get_image_path(image_hash: str) -> Path:
    if not is_valid_hash(image_hash):
        raise ImageNotFoundError("Image not found.")

    path = _storage_root() / _relative_path(image_hash)
    if not path.is_file():
        raise ImageNotFoundError("Image not found.")
    return path
