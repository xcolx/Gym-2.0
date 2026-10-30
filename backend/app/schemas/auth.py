from typing import Literal

from pydantic import BaseModel, Field

from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.schemas.fields import NormalizedEmail, StrongPassword, Username


class BaseAuthRequest(BaseModel):
    client: Literal["mobile", "web"] = Field(
        ...,
        description="The client type initiating the request: either 'mobile' or 'web'. Recorded on the session and the "
        "user (uses_ios, uses_web), every client gets the same session lifetime.",
        examples=["mobile", "web"]
    )


class EmailLoginRequest(BaseAuthRequest):
    email: NormalizedEmail = Field(
        ...,
        description="Registered email address of the user. Case-insensitive, surrounding whitespace is ignored.",
        examples=["john.smith@gym2.app"]
    )
    password: str = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The user's password.",
        examples=["Str0ngP@ssw0rd!"]
    )


class EmailSignUpRequest(EmailLoginRequest):
    password: StrongPassword = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="The user's password. Must be between 8 and 50 characters and contain at least two of: lowercase letters, uppercase letters, digits, special characters.",
        examples=["Str0ngP@ssw0rd!"]
    )
    username: Username = Field(
        ...,
        description="Unique, case-sensitive username for the user, between 3 and 20 characters. Allowed characters: a-z, A-Z, 0-9, '_', '.', '-'.",
        examples=["marggus", "fit_guy123", "muscle_mommy123"]
    )


class ResendVerificationRequest(BaseModel):
    email: NormalizedEmail = Field(
        ...,
        description="Email address of the unverified account. Case-insensitive, surrounding whitespace is ignored.",
        examples=["john.smith@gym2.app"]
    )


class ForgotPasswordRequest(BaseModel):
    email: NormalizedEmail = Field(
        ...,
        description="Email address of the account whose password should be reset. Case-insensitive, surrounding whitespace is ignored.",
        examples=["john.smith@gym2.app"]
    )


class OAuthAuthLoginRequest(BaseAuthRequest):
    id_token: str = Field(
        ...,
        description="The ID token returned by the external identity provider (Google/Apple) frontend SDKs.",
        examples=["eyJhbGciOiJSUzI1NiJ9..."]
    )
    provider: Literal["google", "apple"] = Field(
        ...,
        description="The external identity provider used for authentication: either 'google' or 'apple'.",
        examples=["google", "apple"]
    )


class OAuthAuthSignUpRequest(OAuthAuthLoginRequest):
    username: Username = Field(
        ...,
        description="Unique, case-sensitive username for the user, between 3 and 20 characters. Allowed characters: a-z, A-Z, 0-9, '_', '.', '-'.",
        examples=["johnsmith", "fit_guy123", "muscle_mommy123"]
    )


class AuthResponse(BaseModel):
    success: bool = Field(
        ...,
        description="Indicates if the authentication operation completed successfully.",
        examples=[True]
    )
    message: str = Field(
        ...,
        description="A user-friendly message explaining the result of the action.",
        examples=["User registered successfully. Please check your emails.", "Successfully authenticated via Google.", "Logout successful."]
    )
