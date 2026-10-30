import pytest
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.core import deps
from app.core.config import settings
from app.core.errors import DatabaseError, DatabaseTimeoutError
from app.db.session import get_db


def test_api_responses_have_security_headers(client):
    response = client.get("/v1/users/me")

    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert response.headers["x-frame-options"] == "DENY"


def test_errors_have_name_and_detail(make_user):
    response = make_user().client.get("/v1/workouts/delta", params={"last_sync_time": "2000-01-01T00:00:00Z"})

    assert response.status_code == 400
    assert set(response.json()) == {"error", "detail"}


def test_retired_api_version_answers_410(client, monkeypatch):
    monkeypatch.setattr(settings, "RETIRED_API_VERSIONS", ["v1"])

    response = client.get("/v1/health")

    assert response.status_code == 410
    assert response.json()["error"] == "ApiVersionRetiredError"
    # Unversioned paths keep working
    assert client.get("/health").status_code == 200


def test_deprecated_api_version_sends_header(client, monkeypatch):
    monkeypatch.setattr(settings, "DEPRECATED_API_VERSIONS", ["v1"])

    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.headers["deprecation"] == "true"
    assert "deprecation" not in client.get("/health").headers


def test_cors_allows_the_web_app_with_credentials(client):
    response = client.options("/v1/users/me", headers={
        "origin": "http://localhost:3000", "access-control-request-method": "GET"
    })
    foreign = client.options("/v1/users/me", headers={
        "origin": "https://evil.example", "access-control-request-method": "GET"
    })

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in foreign.headers


def test_admin_is_only_served_on_its_host(client):
    assert client.get("/", headers={"host": "admin.localhost"}).status_code in (200, 302, 307)
    assert client.get("/", headers={"host": "testserver"}).status_code == 404


@pytest.mark.parametrize("method, path", [
    ("get", "/v1/users/me"),
    ("get", "/v1/users/me/friends"),
    ("get", "/v1/chats"),
    ("get", "/v1/workouts"),
    ("get", "/v1/workout-schemes"),
    ("get", "/v1/ai/conversations"),
    ("post", "/v1/reports"),
    ("delete", "/v1/users/me/profile-image"),
    ("delete", "/v1/chats/1/image"),
])
def test_endpoints_require_a_session(client, method, path):
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize("error", [
    PoolTimeoutError("QueuePool limit reached"),
    OperationalError("SELECT 1", {}, Exception("could not connect to server")),
])
def test_unavailable_database_is_answered_with_503(make_user, monkeypatch, error):
    user = make_user("alice")

    def unavailable(db, raw_token):
        raise error

    monkeypatch.setattr(deps, "check_session_token", unavailable)

    response = user.client.get("/v1/users/me")

    assert response.status_code == 503
    assert response.json()["error"] == "DatabaseTimeoutError"


def test_other_database_errors_stay_500():
    sessions = get_db()
    next(sessions)

    with pytest.raises(DatabaseError) as raised:
        sessions.throw(ProgrammingError("SELEC 1", {}, Exception("syntax error")))

    assert not isinstance(raised.value, DatabaseTimeoutError)
