from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, EmailStr, StringConstraints

from app.core import security


def _check_password_strength(value: str) -> str:
    violation = security.get_password_policy_violation(value)
    if violation:
        raise ValueError(violation)
    return value


# Use for every field that sets a NEW password. Fields that only verify an existing
# password (login, current password confirmation) must stay plain `str` so users with
# passwords created under an older policy can still authenticate.
StrongPassword = Annotated[str, AfterValidator(_check_password_strength)]


def _normalize_email(value):
    if isinstance(value, str):
        return value.strip().lower()
    return value


# Use for every email field so lookups and uniqueness don't depend on casing or stray whitespace.
NormalizedEmail = Annotated[EmailStr, BeforeValidator(_normalize_email)]


# Case sensitive
Username = Annotated[str, StringConstraints(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_.-]+$")]
