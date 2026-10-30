import hashlib
import hmac
import secrets
import string
from datetime import datetime

import bcrypt

from app.core.config import settings
from app.core.errors import WeakPasswordError

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 50
PASSWORD_MIN_CHAR_CATEGORIES = 2
BCRYPT_MAX_BYTES = 72


def get_password_policy_violation(password: str) -> str | None:
    """
    Returns a message describing the violation, or None if the password is valid.
    Policy: 8 to 50 characters with at least two of: lowercase letters, uppercase letters, digits, special characters.
    """
    if len(password) < PASSWORD_MIN_LENGTH or len(password) > PASSWORD_MAX_LENGTH:
        return f"Password must be between {PASSWORD_MIN_LENGTH} and {PASSWORD_MAX_LENGTH} characters."

    has_lower = any(c.islower() for c in password)
    has_upper = any(c.isupper() for c in password)
    has_digit = any(c in string.digits for c in password)
    has_special = any(not c.isalnum() for c in password)

    if sum((has_lower, has_upper, has_digit, has_special)) < PASSWORD_MIN_CHAR_CATEGORIES:
        return (
            "Password must contain at least two of the following: lowercase letters, "
            "uppercase letters, digits, special characters."
        )

    return None


def validate_password_strength(password: str) -> None:
    violation = get_password_policy_violation(password)
    if violation:
        raise WeakPasswordError(violation)

def _password_bytes(password: str) -> bytes:
    """
    The bytes bcrypt hashes: the UTF-8 encoding cut to bcrypt's limit of 72 bytes. 50 characters can be longer than
    that, which bcrypt before 5.0 cut silently and bcrypt 5.0 rejects, so existing hashes keep matching.
    """
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    """
    Without a stored hash (unknown user or OAuth-only account) a dummy hash is checked instead,
    so the response time doesn't reveal whether an account exists.
    """
    plain_bytes = _password_bytes(plain_password)

    if not hashed_password:
        bcrypt.checkpw(plain_bytes, _DUMMY_PASSWORD_HASH)
        return False

    return bcrypt.checkpw(plain_bytes, hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    password_bytes = _password_bytes(password)

    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)

    return hashed_bytes.decode("utf-8")


_DUMMY_PASSWORD_HASH = get_password_hash(secrets.token_urlsafe(32)).encode("utf-8")


def generate_session_token() -> str:
    return secrets.token_urlsafe(64)


def generate_password_reset_token() -> str:
    """Generates the raw random token of a password reset link. Only its hash is stored."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def tokens_match(token_hash_a: str, token_hash_b: str) -> bool:
    """Compares two token hashes in constant time."""
    return hmac.compare_digest(token_hash_a.encode("utf-8"), token_hash_b.encode("utf-8"))


def derive_email_verify_token(user_id: int, email: str, expires_at: datetime) -> str:
    """
    Derives the raw email verification token from the user's data and the SECRET_KEY.
    This allows resending the same link without storing the raw token. Changing the email
    or the expiry produces a different token, which invalidates older links.
    """
    message = f"email-verify:{user_id}:{email}:{int(expires_at.timestamp())}"
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
