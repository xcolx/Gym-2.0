from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Response

from app.core import cookies, security
from app.core.config import settings
from app.core.errors import WeakPasswordError
from app.db.models import Session as UserSession
from app.db.queries.session import is_session_valid


@pytest.mark.parametrize("password", [
    "abcdefg1",           # lowercase + digit
    "ABCDEFGh",           # uppercase + lowercase
    "12345678!",          # digit + special
    "Passwort mit Leerzeichen",
    "x" * 49 + "1",       # 50 characters
])
def test_password_policy_accepts(password):
    assert security.get_password_policy_violation(password) is None
    security.validate_password_strength(password)


@pytest.mark.parametrize("password", [
    "Abc123!",            # 7 characters
    "A1" * 25 + "x",      # 51 characters
    "abcdefgh",           # one category
    "ABCDEFGH",
    "12345678",
    "!!!!!!!!",
])
def test_password_policy_rejects(password):
    assert security.get_password_policy_violation(password)
    with pytest.raises(WeakPasswordError):
        security.validate_password_strength(password)


def test_password_hash_verifies_only_the_same_password():
    hashed = security.get_password_hash("Correct-Horse1")

    assert hashed != "Correct-Horse1"
    assert security.verify_password("Correct-Horse1", hashed)
    assert not security.verify_password("Correct-Horse2", hashed)


def test_password_hashes_are_salted():
    assert security.get_password_hash("Same-Passw0rd") != security.get_password_hash("Same-Passw0rd")


def test_password_longer_than_72_bytes_can_be_hashed():
    # 50 characters, but 100 bytes in UTF-8, which bcrypt 5 would reject without cutting
    password = "ä" * 49 + "1"
    hashed = security.get_password_hash(password)

    assert security.verify_password(password, hashed)


def test_password_is_compared_on_its_first_72_bytes():
    # Same as bcrypt before 5.0, so existing hashes keep matching
    hashed = security.get_password_hash("ä" * 36 + "a")

    assert security.verify_password("ä" * 36 + "b", hashed)


def test_verify_password_without_hash_is_false():
    assert security.verify_password("Anything-1", None) is False
    assert security.verify_password("Anything-1", "") is False


def test_session_tokens_are_random_and_hashed_with_sha256():
    token = security.generate_session_token()

    assert token != security.generate_session_token()
    assert len(token) >= 64
    assert len(security.hash_session_token(token)) == 64
    assert security.hash_session_token(token) == security.hash_session_token(token)


def test_tokens_match():
    assert security.tokens_match("abc", "abc")
    assert not security.tokens_match("abc", "abd")


def test_email_verify_token_depends_on_user_email_expiry_and_secret(monkeypatch):
    expires = datetime(2026, 1, 1, tzinfo=UTC)
    token = security.derive_email_verify_token(1, "a@gym2.app", expires)

    assert token == security.derive_email_verify_token(1, "a@gym2.app", expires)
    assert token != security.derive_email_verify_token(2, "a@gym2.app", expires)
    assert token != security.derive_email_verify_token(1, "b@gym2.app", expires)
    assert token != security.derive_email_verify_token(1, "a@gym2.app", expires + timedelta(seconds=1))

    monkeypatch.setattr(settings, "SECRET_KEY", "another-secret")
    assert token != security.derive_email_verify_token(1, "a@gym2.app", expires)


NOW = datetime(2026, 6, 1, tzinfo=UTC)


def _session(created_days_ago: float, active_days_ago: float) -> UserSession:
    return UserSession(created_at=NOW - timedelta(days=created_days_ago), last_active_at=NOW - timedelta(days=active_days_ago))


@pytest.mark.parametrize("created, active, valid", [
    (0, 0, True),
    (29, 29, True),       # within the minimum lifetime, unused
    (31, 6.9, True),      # used within the sliding lifetime
    (31, 7, False),       # sliding lifetime passed
    (729, 0, True),
    (730, 0, False),      # maximum lifetime
])
def test_session_validity(created, active, valid):
    assert is_session_valid(_session(created, active), NOW) is valid


def test_session_cookie_attributes():
    response = Response()
    cookies.set_session_cookie(response, "raw-token", 3600)

    cookie = response.headers["set-cookie"]
    assert cookie.startswith("session_token=raw-token;")
    assert "HttpOnly" in cookie
    assert "Max-Age=3600" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_session_cookie_is_secure_outside_development(monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    response = Response()
    cookies.set_session_cookie(response, "raw-token", 3600)

    assert "Secure" in response.headers["set-cookie"]


def test_clear_session_cookie_headers_expire_the_cookie():
    header = cookies.clear_session_cookie_headers()["set-cookie"]

    assert header.startswith('session_token="";')
    assert "Max-Age=0" in header
    assert "HttpOnly" in header
