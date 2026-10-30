from typing import TYPE_CHECKING, Any, ClassVar, NamedTuple

from anyio import to_thread
from markupsafe import Markup
from sqladmin import Admin, ModelView
from sqladmin.fields import FileField
from sqlalchemy import inspect
from starlette.datastructures import FormData, UploadFile
from starlette.requests import Request
from wtforms.fields import MultipleFileField
from wtforms.validators import InputRequired
from wtforms.widgets import FileInput

from app.core.config import settings
from app.core.errors import ImageTooLargeError
from app.services import image_service


class ImagePreset(NamedTuple):
    quality: int
    max_dimension: int


class ImageAwareAdmin(Admin):
    """
    sqladmin assumes file columns hold storage objects and calls .name/.open() on the stored value when an edit form
    is sent without a new file. Our image columns hold hashes, so the form data is passed through unchanged
    and ImageUploadMixin decides what happens with the uploads.
    """

    @staticmethod
    async def _handle_form_data(request: Request, obj: Any = None) -> FormData:
        return await request.form()


class ImageFileField(FileField):
    """
    File input for image hash columns. sqladmin adds InputRequired to NOT NULL columns, which would also demand a new
    file on every edit. It is dropped here, ImageUploadMixin requires the file only when the row is created.
    The required flag stays, so that browsers still ask for the file in the create form.
    """

    def __init__(self, label: Any = None, validators: Any = None, **kwargs: Any) -> None:
        validators = list(validators or [])
        required = any(isinstance(v, InputRequired) for v in validators)
        super().__init__(label, [v for v in validators if not isinstance(v, InputRequired)], **kwargs)
        if required:
            self.flags.required = True


class ImageListInputWidget(FileInput):
    """File input for several files, with the number of stored images and a checkbox that removes all of them."""

    def __call__(self, field: Any, **kwargs: Any) -> Markup:
        kwargs["multiple"] = True
        kwargs.setdefault("accept", "image/*")
        markup = super().__call__(field, **kwargs)
        if field.object_data:
            checkbox_id = f"{field.id}_checkbox"
            markup = Markup(
                '<p>Currently: {count} image(s). Choosing files replaces all of them.</p>'
                '<div class="form-check"><input class="form-check-input" type="checkbox" id="{id}" name="{id}">'
                '<label class="form-check-label" for="{id}">Clear</label></div>'
            ).format(count=len(field.object_data), id=checkbox_id) + markup
        return markup


class ImageListFileField(MultipleFileField):
    """
    File input for image hash list columns. The chosen files replace the stored list in the order they were chosen,
    without new files the list is kept. Handled by ImageUploadMixin via image_list_columns.
    """
    widget = ImageListInputWidget()

    def __init__(self, label: Any = None, validators: Any = None, **kwargs: Any) -> None:
        # The column is NOT NULL with an empty list as default, the files are never required
        super().__init__(label, [v for v in validators or [] if not isinstance(v, InputRequired)], **kwargs)


if TYPE_CHECKING:
    # The mixin is only used together with ModelView, whose hooks it extends
    _ModelViewBase = ModelView
else:
    _ModelViewBase = object


class ImageUploadMixin(_ModelViewBase):
    """
    Uploads the files of the image_columns (rendered as ImageFileField via form_overrides) through the central image service.
    Without a new file the stored image is kept, "Clear" removes it from nullable columns.
    image_list_columns (rendered as ImageListFileField) hold a list of hashes, which the chosen files replace as a whole.
    Replaced, cleared and deleted images are removed for good once the change is committed.
    """
    image_columns: ClassVar[dict[str, ImagePreset]] = {}
    image_list_columns: ClassVar[dict[str, ImagePreset]] = {}
    max_list_images: ClassVar[int | None] = None

    async def on_model_change(self, data: dict, model: Any, is_created: bool, request: Request) -> None:
        await super().on_model_change(data, model, is_created, request)
        form = await request.form()
        discarded = []

        for column, preset in self.image_columns.items():
            upload = data.get(column)
            contents = await self._read(upload)
            old_hash = None if is_created else getattr(model, column)
            nullable: bool = inspect(self.model).columns[column].nullable

            if contents:
                data[column] = await to_thread.run_sync(self._store_image, contents, preset)
                discarded.append(old_hash)
            elif form.get(f"{column}_checkbox") and nullable:
                data[column] = None
                discarded.append(old_hash)
            elif is_created and not nullable:
                raise ValueError(f"An image is required for {column}.")
            else:
                # Leaves the stored image untouched
                data.pop(column, None)

        for column, preset in self.image_list_columns.items():
            uploads = [upload for upload in data.get(column) or [] if isinstance(upload, UploadFile)]
            # Browsers send an empty file when none was chosen
            files = [file for file in [await self._read(upload) for upload in uploads] if file]
            old_hashes = [] if is_created else list(getattr(model, column))

            if self.max_list_images is not None and len(files) > self.max_list_images:
                raise ValueError(f"At most {self.max_list_images} images are allowed for {column}.")
            if files:
                data[column] = [await to_thread.run_sync(self._store_image, file, preset) for file in files]
                discarded.extend(old_hashes)
            elif form.get(f"{column}_checkbox") or is_created:
                data[column] = []
                discarded.extend(old_hashes)
            else:
                data.pop(column, None)

        request.state.discarded_images = discarded

    @staticmethod
    async def _read(upload: Any) -> bytes:
        if not isinstance(upload, UploadFile):
            return b""
        contents = await upload.read(settings.IMAGE_MAX_UPLOAD_BYTES + 1)
        if len(contents) > settings.IMAGE_MAX_UPLOAD_BYTES:
            raise ImageTooLargeError(f"Images cannot be larger than {settings.IMAGE_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        return contents

    async def after_model_change(self, data: dict, model: Any, is_created: bool, request: Request) -> Any:
        for image_hash in getattr(request.state, "discarded_images", []):
            image_service.delete_image_file(image_hash)
        return await super().after_model_change(data, model, is_created, request)

    async def on_model_delete(self, model: Any, request: Request) -> None:
        request.state.discarded_images = [
            *(getattr(model, column) for column in self.image_columns),
            *(image_hash for column in self.image_list_columns for image_hash in getattr(model, column)),
        ]
        await super().on_model_delete(model, request)

    async def after_model_delete(self, model: Any, request: Request) -> None:
        for image_hash in getattr(request.state, "discarded_images", []):
            image_service.delete_image_file(image_hash)
        await super().after_model_delete(model, request)

    @staticmethod
    def _store_image(contents: bytes, preset: ImagePreset) -> str:
        image = image_service.decode_image(contents)
        return image_service.write_image(image, quality=preset.quality, max_dimension=preset.max_dimension)
