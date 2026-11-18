import logging
from datetime import UTC, datetime
from typing import Literal

import httpx

from app.core.config import settings
from app.db.models import User

logger = logging.getLogger(__name__)

# The same as the SMTP timeouts of the mailserver (SMTP_TIMEOUT_MS in infra/mailserver/server.js)
MAILSERVER_TIMEOUT_SECONDS = 15

VerificationReason = Literal["signup", "email_change"]
# What an address is told about its account: someone tried to sign up with it although it has an account
# ("signup_registered") or a deleted account that can still be reenabled ("signup_deleted"), or its deleted account was
# reenabled by a login ("reenabled")
AccountNotice = Literal["signup_registered", "signup_deleted", "reenabled"]


def verification_reason(user: User) -> VerificationReason:
    """The reason a verification email is sent to a user: a pending email change or the verification of a signup."""
    return "email_change" if user.email_change else "signup"


def _minutes_until(expires_at: datetime) -> int:
    """The whole minutes until a link expires (at least 1), which the email states as its validity."""
    return max(1, round((expires_at - datetime.now(UTC)).total_seconds() / 60))


def send_verification_email(
    email: str,
    user_id: int,
    raw_token: str,
    expires_at: datetime,
    reason: VerificationReason = "signup"
) -> bool:
    """
    Asks the internal mailserver to send the email verification link. The reason picks the text: a new account
    ("signup") or the confirmation of a changed email ("email_change").
    Returns True if the mailserver accepted the email, False otherwise. Failures are logged, not raised,
    because the user can always request the email again.
    """
    try:
        response = httpx.post(
            f"{settings.MAILSERVER_URL}/api/send-verification",
            json={
                "email": email,
                "user_id": user_id,
                "token": raw_token,
                "expires_in_minutes": _minutes_until(expires_at),
                "reason": reason
            },
            timeout=MAILSERVER_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send verification email for user %s", user_id)
        return False


def send_already_registered_email(email: str, user_id: int) -> bool:
    """
    Asks the internal mailserver to tell an address that another account (user_id) tried to change its email to it,
    although an account with this address already exists, so nothing was changed.
    Returns True if the mailserver accepted the email, False otherwise. Failures are logged, not raised.
    """
    try:
        response = httpx.post(
            f"{settings.MAILSERVER_URL}/api/send-already-registered",
            json={"email": email, "user_id": user_id},
            timeout=MAILSERVER_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send the already registered email for user %s", user_id)
        return False


def send_account_notice_email(
    email: str,
    user_id: int,
    notice: AccountNotice,
    raw_reset_token: str | None = None,
    reset_expires_at: datetime | None = None,
    removal_date: str | None = None
) -> bool:
    """
    Asks the internal mailserver to tell the address of an account (user_id) what happened with it, see AccountNotice.
    "signup_registered" carries a password reset link if the account has a password (raw_reset_token, reset_expires_at),
    "signup_deleted" the day the deleted account is removed permanently (removal_date).
    Returns True if the mailserver accepted the email, False otherwise. Failures are logged, not raised.
    """
    payload: dict[str, str | int] = {"email": email, "user_id": user_id, "notice": notice}
    if raw_reset_token and reset_expires_at:
        payload["token"] = raw_reset_token
        payload["expires_in_minutes"] = _minutes_until(reset_expires_at)
    if removal_date:
        payload["removal_date"] = removal_date

    try:
        response = httpx.post(
            f"{settings.MAILSERVER_URL}/api/send-account-notice", json=payload, timeout=MAILSERVER_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send the %s email for user %s", notice, user_id)
        return False


def send_password_reset_email(
    email: str,
    user_id: int,
    raw_token: str,
    expires_at: datetime,
    removal_date: str | None = None
) -> bool:
    """
    Asks the internal mailserver to send the password reset link. For a deleted account removal_date is the day it is
    removed permanently: the email then explains that the reset doesn't reenable the account, logging in does.
    Returns True if the mailserver accepted the email, False otherwise. Failures are logged, not raised,
    because the user can always request a new link.
    """
    try:
        response = httpx.post(
            f"{settings.MAILSERVER_URL}/api/send-password-reset",
            json={
                "email": email,
                "user_id": user_id,
                "token": raw_token,
                "expires_in_minutes": _minutes_until(expires_at),
                **({"removal_date": removal_date} if removal_date else {})
            },
            timeout=MAILSERVER_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send password reset email for user %s", user_id)
        return False
