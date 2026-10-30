
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.schemas.fields import NormalizedEmail, StrongPassword, Username


class UpdateUserRequest(BaseModel):
    bodyweight: float | None = Field(
        None,
        allow_inf_nan=False,
        description="User's bodyweight in kilograms, rounded to 1 decimal place. Must be between 0.1 and 999.9 after rounding.",
        examples=[70.5]
    )
    scheme_color: str | None = Field(
        None,
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="User's preferred color scheme for the app in hex code.",
        examples=["#FF0000"]
    )
    weight_unit: int | None = Field(
        None,
        ge=0,
        le=1,
        description="User's preferred weight unit. 0 for metric, 1 for imperial.",
        examples=[0]
    )
    distance_unit: int | None = Field(
        None,
        ge=0,
        le=1,
        description="User's preferred distance unit. 0 for metric, 1 for imperial.",
        examples=[0]
    )
    language: str | None = Field(
        None,
        pattern=r"^[a-z]{2}$",
        description="User's preferred language in ISO 639-1 format (e.g., 'en' for English).",
        examples=["en", "de", "fr"]
    )


    @field_validator("bodyweight")
    @classmethod
    def round_bodyweight(cls, value: float | None) -> float | None:
        # Rounded here, so that a value like 999.95 isn't rounded up to 1000.0 by the NUMERIC(4,1) column, which overflows
        if value is None:
            return value
        value = round(value, 1)
        if not 0.1 <= value <= 999.9:
            raise ValueError("Bodyweight must be between 0.1 and 999.9 kg.")
        return value


class UpdateUsernameRequest(BaseModel):
    username: Username = Field(
        ...,
        description="The new, case-sensitive username for the user. Must be unique and between 3 to 20 characters. Allowed characters: a-z, A-Z, 0-9, '_', '.', '-'.",
        examples=["new_username"]
    )

class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The user's current password. Must be between 8 and 50 characters.",
        examples=["currentPassword123"]
    )
    new_password: StrongPassword = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The new password for the user. Must be between 8 and 50 characters and contain at least two of: lowercase letters, uppercase letters, digits, special characters.",
        examples=["newPassword456"]
    )

class UpdateEmailRequest(BaseModel):
    email: NormalizedEmail = Field(
        ...,
        description="The new email address to be registered. Case-insensitive, surrounding whitespace is ignored.",
        examples=["john.smith@gym2.app"]
    )
    password: str = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The user's current password to confirm the email change.",
        examples=["currentPassword123"]
    )

class DeleteAccountRequest(BaseModel):
    password: str | None = Field(
        None,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The user's current password to confirm the deletion. Required unless the account uses an external sign-in provider and has no password.",
        examples=["currentPassword123"]
    )

class FriendRequestUpdateRequest(BaseModel):
    status: bool = Field(
        ...,
        description="Answer to the friend request. True for accept, False for decline.",
        examples=[True, False]
    )


class UserUpdateResponse(BaseModel):
    success: bool = Field(
        ...,
        description="Indicates if the user update operation was successful.",
        examples=[True]
    )
    message: str | None = Field(
        None,
        description="Additional information about the update operation.",
        examples=["User updated successfully.", "No changes were made."]
    )


class UserImageUpdateResponse(BaseModel):
    success: bool = Field(
        ...,
        description="Indicates if the user image update operation was successful.",
        examples=[True]
    )
    image_url: str | None = Field(
        None,
        description="Image hash of the updated profile image (served by GET /v1/images/{hash}), if the update was successful.",
        examples=["3fa9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100"]
    )
    icon_url: str | None = Field(
        None,
        description="Image hash of the updated square profile icon (served by GET /v1/images/{hash}), if the update was successful.",
        examples=["9b1e0c7d6a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa9988776655"]
    )
    message: str | None = Field(
        None,
        description="Additional information about the image update operation.",
        examples=["Profile image updated successfully.", "No changes were made."]
    )


class UserResponse(BaseModel):
    id: int = Field(
        ...,
        description="The unique identifier for the user.",
        examples=[1]
    )
    username: str = Field(
        ...,
        description="The username of the user.",
        examples=["johnsmith"]
    )
    email: EmailStr | None = Field( # only if requested user is current user
        None,
        description="The email address of the user.",
        examples=["john.smith@gym2.app"]
    )
    profile_image_url: str = Field(
        ...,
        description="Image hash of the user's profile image (served by GET /v1/images/{hash}), empty if the user has none.",
        examples=["3fa9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100"]
    )
    profile_icon_url: str = Field(
        ...,
        description="Image hash of the user's square profile icon (served by GET /v1/images/{hash}), empty if the user has none.",
        examples=["9b1e0c7d6a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa9988776655"]
    )
    bodyweight: float | None = Field( # only if requested user is current user
        None,
        description="User's bodyweight in kilograms, with 1 decimal place.",
        examples=[70.5]
    )
    scheme_color: str | None = Field( # always included, null if the user never chose one
        None,
        max_length=7,
        description="User's app color in hex code. Shared with everyone, e.g. for the border around the profile image.",
        examples=["#FF0000"]
    )
    weight_unit: int | None = Field( # only if requested user is current user
        None,
        description="User's preferred weight unit. 0 for metric, 1 for imperial.",
        examples=[0]
    )
    distance_unit: int | None = Field( # only if requested user is current user
        None,
        description="User's preferred distance unit. 0 for metric, 1 for imperial.",
        examples=[0]
    )
    language: str | None = Field( # only if requested user is friend of / or current user
        None,
        max_length=2,
        description="User's preferred language in ISO 639-1 format (e.g., 'en' for English).",
        examples=["en", "de", "fr"]
    )
    created_at: str | None = Field( # only if requested user is current user
        None,
        description="Date and time the account was created in ISO 8601 format.",
        examples=["2024-06-01T18:30:00+00:00"]
    )


class FriendRequestResponse(BaseModel):
    sender: UserResponse = Field(
        ...,
        description="Public profile of the user who sent the friend request.",
    )
    timestamp: str = Field(
        ...,
        description="Date and time the friend request was sent in ISO 8601 format.",
        examples=["2024-06-01T18:30:00Z"]
    )


class SentFriendRequestResponse(BaseModel):
    receiver: UserResponse = Field(
        ...,
        description="Public profile of the user the friend request was sent to.",
    )
    timestamp: str = Field(
        ...,
        description="Date and time the friend request was sent in ISO 8601 format.",
        examples=["2024-06-01T18:30:00Z"]
    )


class FriendRequestPatchResponse(UserUpdateResponse):
    new_friend: UserResponse | None = Field(
        None,
        description="The updated friend information after the friend request has been accepted.",
    )

