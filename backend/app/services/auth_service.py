from datetime import UTC, datetime, timedelta

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


def signup_with_email(db: Session, payload: EmailSignUpRequest) -> tuple[User, str] | None:
    """
    Returns the new user and the raw verification token, or None if the email is already registered, which isn't
    reported to the caller. The password is hashed before any lookup to keep the response time the same in both cases.
    """
    security.validate_password_strength(payload.password)
    hashed_password = security.get_password_hash(payload.password)

    content_filter.check_username(payload.username)
    if crud_users.get_user_by_username(db, username=payload.username):
        raise UserAlreadyExistsError(USERNAME_TAKEN_MESSAGE)

    if crud_users.get_user_by_email(db, email=payload.email, include_deleted=True):
        return None

    try:
        # Savepoint, so a concurrent signup with the same email/username only rolls back this insert
        with db.begin_nested():
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

    return new_user, raw_token


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


def login_with_email(db: Session, payload: EmailLoginRequest, ip_address: str | None) -> tuple[str, int]:
    """
    Returns the raw session token and its maximum lifetime in seconds.
    """
    user = crud_users.get_user_by_email(db, email=payload.email)

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
    return raw_token, int(max_lifetime.total_seconds())


INVALID_RESET_LINK_MESSAGE = "This password reset link is invalid or has expired. Please request a new one."


def request_password_reset(db: Session, email: str) -> tuple[User, str] | None:
    """
    Stores the hash and expiry of a new password reset token on the user and returns the user and the raw token
    for the email link. A new request replaces the token, so only the newest link works.
    Returns None if there is no account with a password for the email, which is not reported to the caller.
    """
    user = crud_users.get_user_by_email(db, email=email)

    if not user or not user.pw_hash:
        return None

    raw_token = security.generate_password_reset_token()
    user.pw_reset_token = security.hash_session_token(raw_token)
    user.pw_reset_expire = datetime.now(UTC) + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)

    # Committed before the email is sent, so the link never carries a token that isn't stored yet
    db.commit()

    return user, raw_token


def get_user_for_password_reset(db: Session, token: str) -> User:
    """Returns the user of a valid, unexpired password reset token. Raises an AuthenticationError otherwise."""
    user = crud_users.get_user_by_reset_token(db, security.hash_session_token(token)) if token else None

    if not user:
        raise AuthenticationError(INVALID_RESET_LINK_MESSAGE)

    return user


def reset_password(db: Session, token: str, new_password: str) -> None:
    """
    Sets the new password of the user of a valid password reset token, invalidates the token and logs the user out
    on all devices. Since the link proves the user owns the email, an account whose email wasn't verified yet is
    activated as well.
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


def logout_session(db: Session, raw_token: str | None) -> None:
    """
    Does nothing without a token.
    """
    if not raw_token:
        return

    crud_session.delete_session_by_token(db, raw_token)
