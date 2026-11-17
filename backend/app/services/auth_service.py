from datetime import UTC, datetime, timedelta
from typing import Literal, NamedTuple

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.db.queries.session as crud_session
import app.db.queries.users as crud_users
from app.core import content_filter, security
from app.core.config import settings
from app.core.errors import AuthenticationError, EmailVerificationError, UserAlreadyExistsError
from app.db.models import User
from app.schemas.auth import EmailLoginRequest, EmailSignUpRequest
from app.services import mail_service
from app.services.maintenance_service import RETENTION

USERNAME_TAKEN_MESSAGE = "This username is already taken."
USERNAME_UNIQUE_CONSTRAINT = "user_user_name_key"


def verification_address(user: User) -> str:
    """
    The address that has to be verified and that the verification link is sent to: the requested new email while
    an email change is pending, the account's email otherwise.
    """
    return user.email_change or user.email


def issue_email_verification(user: User) -> str:
    """
    Sets a fresh email verification token and expiry on the user and returns the raw token for the email link.
    The expiry is truncated to whole seconds so the token can be derived again from the stored value.
    """
    expires_at = (datetime.now(UTC) + timedelta(hours=settings.EMAIL_VERIFY_EXPIRE_HOURS)).replace(microsecond=0)
    raw_token = security.derive_email_verify_token(user.id, verification_address(user), expires_at)

    user.email_verify_token = security.hash_session_token(raw_token)
    user.email_verify_expire = expires_at

    return raw_token


def get_or_issue_email_verification(user: User) -> str:
    """
    Returns the raw token of the user's current verification link if it is still valid, so a resent email
    carries the same link. Issues a new token if the current one expired or can't be derived anymore.
    """
    if user.email_verify_token and user.email_verify_expire and user.email_verify_expire > datetime.now(UTC):
        raw_token = security.derive_email_verify_token(user.id, verification_address(user), user.email_verify_expire)
        if security.tokens_match(security.hash_session_token(raw_token), user.email_verify_token):
            return raw_token

    return issue_email_verification(user)


def mark_email_verified(db: Session, user: User) -> None:
    """
    Marks the email of the user as verified. A pending email change replaces the email now, unless another account
    registered the new address in the meantime. A password reset link sent to the old address stops working.
    """
    if user.email_change:
        if crud_users.get_user_by_email(db, email=user.email_change, include_deleted=True):
            raise EmailVerificationError(
                "This email address is already used by another account. Please change your email to a different one."
            )
        user.email = user.email_change
        user.email_change = None
        user.pw_reset_token = None
        user.pw_reset_expire = None

    user.active = True
    user.email_verify_token = None
    user.email_verify_expire = None


class Signup(NamedTuple):
    """
    What a signup led to and which email its address gets:
    - "created": a new unverified account, raw_token is its email verification token
    - "registered": the email already has an account, raw_token is a password reset token (None without a password)
    - "deleted": the email has an account its user deleted, which a login reenables
    """
    outcome: Literal["created", "registered", "deleted"]
    user: User
    raw_token: str | None = None


def removal_date(user: User) -> str | None:
    """The day a deleted account is removed permanently by the prune job, as the emails state it, e.g. "December 17, 2026"."""
    if user.deleted_at is None:
        return None
    removed_at = user.deleted_at + RETENTION
    return f"{removed_at:%B} {removed_at.day}, {removed_at.year}"


def _is_unverified_signup(user: User) -> bool:
    """
    A signup whose email was never verified, like the ones the prune job removes after a few days. Accounts that have
    logged in before aren't, e.g. one that was marked unverified in the admin.
    """
    return not user.active and user.last_login is None and user.deleted_at is None


def _issue_password_reset(user: User) -> str:
    """Sets a new password reset token and expiry on the user, which replaces the previous one, and returns the raw token."""
    raw_token = security.generate_password_reset_token()
    user.pw_reset_token = security.hash_session_token(raw_token)
    user.pw_reset_expire = datetime.now(UTC) + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)
    return raw_token


def _signup_with_registered_email(db: Session, user: User) -> Signup | None:
    """
    The email of a signup already belongs to an account, which is told about the attempt instead: how to log in or
    reset the password, or how to reenable the account if it was deleted. Returns None for a deleted account without
    a password, which can't be reenabled by a login and gets no email.
    """
    if user.deleted_at is not None:
        if not user.pw_hash:
            return None
        return Signup("deleted", user)

    if not user.pw_hash:
        return Signup("registered", user)

    raw_token = _issue_password_reset(user)
    # Committed before the email is sent, so the link never carries a token that isn't stored yet
    db.commit()
    return Signup("registered", user, raw_token)


def signup_with_email(db: Session, payload: EmailSignUpRequest) -> Signup | None:
    """
    Creates an unverified account. If the email already belongs to one, nothing is created and the response stays
    the same, but the address is told about it (see Signup), so the email the response promises does arrive. An
    account of this email that never verified it is replaced by the new signup: whoever owns the address may have
    mistyped the password or never received the link, and its old verification link stops working.
    Returns None if no email has to be sent.
    The password is hashed before any lookup to keep the response time the same in all cases.
    """
    security.validate_password_strength(payload.password)
    hashed_password = security.get_password_hash(payload.password)

    content_filter.check_username(payload.username)
    email_owner = crud_users.get_user_by_email(db, email=payload.email, include_deleted=True)
    replaced_id = email_owner.id if email_owner and _is_unverified_signup(email_owner) else None

    # The username of the replaced account is free again
    username_owner = crud_users.get_user_by_username(db, username=payload.username)
    if username_owner and username_owner.id != replaced_id:
        raise UserAlreadyExistsError(USERNAME_TAKEN_MESSAGE)

    if email_owner and replaced_id is None:
        return _signup_with_registered_email(db, email_owner)

    try:
        # Savepoint, so a concurrent signup with the same email/username only rolls back this replacement and insert
        with db.begin_nested():
            if replaced_id is not None:
                crud_users.delete_user_permanently(db, replaced_id)
            new_user = crud_users.create_user_with_email(
                db=db,
                username=payload.username,
                email=payload.email,
                hashed_password=hashed_password,
                uses_ios=payload.client == "mobile",
                uses_web=payload.client == "web"
            )
    except IntegrityError as error:
        if getattr(getattr(error.orig, "diag", None), "constraint_name", None) == USERNAME_UNIQUE_CONSTRAINT:
            raise UserAlreadyExistsError(USERNAME_TAKEN_MESSAGE) from error
        return None

    raw_token = issue_email_verification(new_user)

    # Committed before the email is sent, so the link never points to a user that doesn't exist yet
    db.commit()

    return Signup("created", new_user, raw_token)


def resend_verification_email(db: Session, email: str) -> tuple[User, str] | None:
    """
    Returns the user and the raw token to resend the verification email with. The token stays the same
    as long as the current link hasn't expired.
    Returns None if there is no unverified account for the email, which is not reported to the caller.
    """
    user = crud_users.get_user_by_email(db, email=email)

    if not user or user.active or not user.email_verify_token:
        return None

    raw_token = get_or_issue_email_verification(user)
    db.commit()

    return user, raw_token


def verify_email(db: Session, user_id: int, token: str) -> str:
    user = crud_users.get_user_by_id(db, user_id)

    if user and user.active and not user.email_verify_token:
        return "Email is already verified. You can log in."

    if (
        not user
        or not user.email_verify_token
        or not security.tokens_match(security.hash_session_token(token), user.email_verify_token)
    ):
        raise AuthenticationError("Invalid email verification link.")

    if not user.email_verify_expire or user.email_verify_expire < datetime.now(UTC):
        raw_token = issue_email_verification(user)
        assert user.email_verify_expire is not None  # Set with the token
        # Committed explicitly, because the raised error rolls back the request transaction
        db.commit()

        if mail_service.send_verification_email(
            verification_address(user), user.id, raw_token, user.email_verify_expire, mail_service.verification_reason(user)
        ):
            raise EmailVerificationError("This verification link has expired. A new one has been sent to your email.")
        raise EmailVerificationError("This verification link has expired. Please request a new verification email.")

    is_email_change = user.email_change is not None
    mark_email_verified(db, user)
    db.flush()

    if is_email_change:
        return "Your new email is confirmed. Use it to log in from now on."
    return "Email verified successfully! You can now log in."


def login_with_email(db: Session, payload: EmailLoginRequest, ip_address: str | None) -> tuple[str, int, User | None]:
    """
    Logging in to a deleted account reenables it, as long as the prune job hasn't removed it yet.
    Returns the raw session token, its maximum lifetime in seconds and the user if the account was reenabled (None otherwise).
    """
    user = crud_users.get_user_by_email(db, email=payload.email, include_deleted=True)

    # Always runs bcrypt, also for unknown emails and OAuth-only accounts, so timing doesn't reveal accounts
    password_valid = security.verify_password(payload.password, user.pw_hash if user else None)

    if not user or not password_valid:
        if user:
            crud_users.update_on_failed_login(db, user.id)
            # Committed explicitly, because the raised error rolls back the request transaction
            db.commit()
        raise AuthenticationError("Invalid email or password.")

    if not user.active:
        raise EmailVerificationError("Email not verified. Please verify your email before logging in.")

    reenabled = user.deleted_at is not None
    if reenabled:
        crud_users.restore_deleted_user(user)

    crud_users.update_on_successful_login(db, user.id)

    if payload.client == "mobile":
        user.uses_ios = True
    else:
        user.uses_web = True

    raw_token = security.generate_session_token()
    crud_session.create_session(db, user_id=user.id, raw_token=raw_token, agent=payload.client, ip_address=ip_address)

    db.commit()

    # The cookie lives as long as the session can at most, the database decides whether it is still valid
    max_lifetime = crud_session.get_session_lifetime().max
    return raw_token, int(max_lifetime.total_seconds()), user if reenabled else None


INVALID_RESET_LINK_MESSAGE = "This password reset link is invalid or has expired. Please request a new one."


def request_password_reset(db: Session, email: str) -> tuple[User, str] | None:
    """
    Stores the hash and expiry of a new password reset token on the user and returns the user and the raw token
    for the email link. A new request replaces the token, so only the newest link works.
    A deleted account gets the link too: the new password doesn't reenable the account, logging in with it does.
    Returns None if there is no account with a password for the email, which is not reported to the caller.
    """
    user = crud_users.get_user_by_email(db, email=email, include_deleted=True)

    if not user or not user.pw_hash:
        return None

    raw_token = _issue_password_reset(user)

    # Committed before the email is sent, so the link never carries a token that isn't stored yet
    db.commit()

    return user, raw_token


def get_user_for_password_reset(db: Session, token: str) -> User:
    """Returns the user of a valid, unexpired password reset token. Raises an AuthenticationError otherwise."""
    user = crud_users.get_user_by_reset_token(db, security.hash_session_token(token)) if token else None

    if not user:
        raise AuthenticationError(INVALID_RESET_LINK_MESSAGE)

    return user


def reset_password(db: Session, token: str, new_password: str) -> bool:
    """
    Sets the new password of the user of a valid password reset token, invalidates the token and logs the user out
    on all devices. Since the link proves the user owns the email, an account whose email wasn't verified yet is
    activated as well. A deleted account stays deleted until its user logs in.
    Returns whether the account is deleted.
    """
    user = get_user_for_password_reset(db, token)

    security.validate_password_strength(new_password)

    user.pw_hash = security.get_password_hash(new_password)
    user.updated_pw_at = datetime.now(UTC)
    user.pw_reset_token = None
    user.pw_reset_expire = None
    user.failed_login_attempts = 0

    if not user.active:
        user.active = True
        user.email_verify_token = None
        user.email_verify_expire = None

    crud_session.delete_all_sessions_for_user(db, user.id)
    db.flush()

    return user.deleted_at is not None


def logout_session(db: Session, raw_token: str | None) -> None:
    """
    Does nothing without a token.
    """
    if not raw_token:
        return

    crud_session.delete_session_by_token(db, raw_token)
