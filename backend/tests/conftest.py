"""
The tests run against a real Postgres database whose schema was created by Flyway, passed in DATABASE_URL. The
mailserver and the Ollama server are stubbed, so no test leaves the machine. After every test that used the database
all rows are deleted, and the tests refuse to start if the database contains users that weren't created by them.
"""

import functools
import io
import json
import os
import tempfile
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest

if not os.environ.get("DATABASE_URL"):
    raise pytest.UsageError(
        "DATABASE_URL is not set. Point it to a Postgres database migrated with Flyway (backend/db/migrations), e.g. "
        "postgresql://admin:dev_password@localhost:5432/gym2_db. All of its tables are emptied by the tests."
    )

IMAGE_DIR = tempfile.mkdtemp(prefix="gym2-test-images-")

os.environ["ENVIRONMENT"] = "development"
os.environ["IMAGE_STORAGE_PATH"] = IMAGE_DIR
# Port 9 (discard) is closed, so a call that slips through the stubs fails right away instead of reaching anything
os.environ["MAILSERVER_URL"] = "http://127.0.0.1:9"
os.environ["OLLAMA_URL"] = "http://127.0.0.1:9"
# The NudeNet check is off, tests/test_nudity_filter.py fakes its scores
os.environ["NUDITY_FILTER_MODEL_PATH"] = ""
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_HOST"] = "admin.localhost"
os.environ["DEPRECATED_API_VERSIONS"] = "[]"
os.environ["RETIRED_API_VERSIONS"] = "[]"

import bcrypt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import event, text  # noqa: E402

from app.core.rate_limit import limiter  # noqa: E402
from app.db.models import Base, Equipment, Exercise, Muscle, MuscleGroup  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import mail_service  # noqa: E402

# Every email of a test user ends with this, see _check_database_is_disposable
TEST_EMAIL_DOMAIN = "tests.gym2.app"
DEFAULT_PASSWORD = "Test-Passw0rd"


@functools.cache
def _all_tables() -> tuple[str, ...]:
    with engine.connect() as connection:
        return tuple(connection.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history'"
        )).scalars())


def _check_database_is_disposable() -> None:
    """Refuses to run against a database with real users, e.g. the development database with its data."""
    with engine.connect() as connection:
        foreign_users = connection.execute(
            text('SELECT count(*) FROM "user" WHERE email IS NULL OR email NOT LIKE :pattern'),
            {"pattern": f"%@{TEST_EMAIL_DOMAIN}"}
        ).scalar_one()
    if foreign_users:
        pytest.exit(
            f"The database of DATABASE_URL contains {foreign_users} users that weren't created by the tests. "
            "The tests empty every table, use a separate database for them.",
            returncode=1
        )


class _DatabaseUse:
    """Whether a test opened a transaction, the others (pure functions) don't need a cleanup."""
    used = False


@event.listens_for(engine, "begin")
def _on_begin(connection) -> None:
    _DatabaseUse.used = True


def _empty_tables() -> None:
    """
    Deletes all rows, children before parents. DELETE is a lot faster than TRUNCATE for the few rows of a test and
    doesn't wait for the locks of connections in the pool. Tables without a model are truncated.
    """
    model_tables = [table.name for table in reversed(Base.metadata.sorted_tables)]
    other_tables = [table for table in _all_tables() if table not in model_tables]
    with engine.begin() as connection:
        for table in model_tables:
            connection.execute(text(f'DELETE FROM "{table}"'))
        if other_tables:
            connection.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in other_tables) + " CASCADE"))


@pytest.fixture(scope="session", autouse=True)
def _prepare_database():
    _check_database_is_disposable()
    _empty_tables()


@pytest.fixture(autouse=True)
def _clean_database(_prepare_database):
    _DatabaseUse.used = False
    yield
    if _DatabaseUse.used:
        _empty_tables()


@pytest.fixture
def db():
    """
    A database session for arranging and checking data next to the API. Commit after changes, and don't leave a
    transaction open while calling the API: the sync times of the delta endpoints wait for open transactions.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def run_sql(sql: str, **params) -> Any:
    """Runs a statement in its own committed transaction and returns the result rows."""
    with engine.begin() as connection:
        result = connection.execute(text(sql), params)
        return result.all() if result.returns_rows else None


@dataclass
class SentMail:
    kind: str  # "verification", "password_reset" or "already_registered"
    email: str
    user_id: int
    token: str | None
    reason: str | None = None


@dataclass
class Outbox:
    mails: list[SentMail] = field(default_factory=list)
    accept: bool = True  # What the stubbed mailserver answers

    def last(self, kind: str | None = None, email: str | None = None) -> SentMail:
        matches = [m for m in self.mails if (kind is None or m.kind == kind) and (email is None or m.email == email)]
        assert matches, f"No {kind or ''} email sent to {email or 'anyone'}."
        return matches[-1]


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> Outbox:
    """Replaces the calls to the mailserver, the sent emails (with their tokens) are collected instead."""
    box = Outbox()

    def send_verification_email(email, user_id, raw_token, expires_at, reason="signup"):
        box.mails.append(SentMail("verification", email, user_id, raw_token, reason))
        return box.accept

    def send_password_reset_email(email, user_id, raw_token, expires_at):
        box.mails.append(SentMail("password_reset", email, user_id, raw_token))
        return box.accept

    def send_already_registered_email(email, user_id):
        box.mails.append(SentMail("already_registered", email, user_id, None))
        return box.accept

    monkeypatch.setattr(mail_service, "send_verification_email", send_verification_email)
    monkeypatch.setattr(mail_service, "send_password_reset_email", send_password_reset_email)
    monkeypatch.setattr(mail_service, "send_already_registered_email", send_already_registered_email)
    return box


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Outbound HTTP calls of the app (mailserver, Ollama) fail, tests that need them stub them on purpose."""
    import httpx

    def blocked(*args, **kwargs):
        raise AssertionError("Outbound HTTP request in a test. Stub the call instead.")

    monkeypatch.setattr(httpx, "post", blocked)
    monkeypatch.setattr(httpx, "get", blocked)


@pytest.fixture(autouse=True)
def _fast_password_hashing(monkeypatch):
    """bcrypt with the lowest cost, the hashes stay valid bcrypt hashes."""
    gensalt = bcrypt.gensalt
    monkeypatch.setattr(bcrypt, "gensalt", lambda rounds=4, prefix=b"2b": gensalt(rounds=4, prefix=prefix))


@pytest.fixture(autouse=True)
def _rate_limits_off():
    limiter.enabled = False
    yield
    limiter.enabled = False
    limiter.reset()


@pytest.fixture
def rate_limits():
    """Turns the rate limits on for a test, starting with empty counters."""
    limiter.reset()
    limiter.enabled = True
    return limiter


def new_client() -> TestClient:
    # Not used as a context manager, so the lifespan (request stats flusher) doesn't run. The client address has to be
    # an IP like behind uvicorn, the sessions store it in an INET column.
    return TestClient(app, base_url="http://testserver", client=("127.0.0.1", 50000))


@pytest.fixture
def client() -> TestClient:
    return new_client()


@dataclass
class ApiUser:
    client: TestClient
    id: int
    username: str
    email: str
    password: str

    @property
    def session_token(self) -> str:
        return self.client.cookies.get("session_token")


def signup(client: TestClient, username: str, email: str, password: str = DEFAULT_PASSWORD, platform: str = "web"):
    return client.post("/v1/auth/signup/email", json={
        "client": platform, "email": email, "password": password, "username": username
    })


def login(client: TestClient, email: str, password: str = DEFAULT_PASSWORD, platform: str = "web"):
    return client.post("/v1/auth/login/email", json={"client": platform, "email": email, "password": password})


@pytest.fixture
def make_user(outbox):
    """
    Creates a user through the API like the apps do (sign up, open the verification link, log in) and returns it
    with a client that holds its session cookie.
    """
    counter = iter(range(1, 1000))

    def factory(username: str | None = None, password: str = DEFAULT_PASSWORD, verify: bool = True, log_in: bool = True) -> ApiUser:
        number = next(counter)
        username = username or f"user{number}"
        email = f"{username.lower()}@{TEST_EMAIL_DOMAIN}"
        client = new_client()

        response = signup(client, username, email, password)
        assert response.status_code == 201, response.text
        mail = outbox.last("verification", email)

        if verify:
            response = client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token})
            assert response.status_code == 200, response.text
            if log_in:
                response = login(client, email, password)
                assert response.status_code == 200, response.text

        return ApiUser(client=client, id=mail.user_id, username=username, email=email, password=password)

    return factory


def make_friends(a: ApiUser, b: ApiUser) -> None:
    assert a.client.post(f"/v1/users/me/friend-requests/{b.id}").status_code == 201
    response = b.client.patch(f"/v1/users/me/friend-requests/{a.id}", json={"status": True})
    assert response.status_code == 200, response.text


def png_bytes(size: tuple[int, int] = (64, 48), color: tuple = (200, 30, 30, 255)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", size, color).save(buffer, "PNG")
    return buffer.getvalue()


def image_file_exists(image_hash: str) -> bool:
    return os.path.isfile(os.path.join(IMAGE_DIR, image_hash[:2], f"{image_hash[2:]}.jpg"))


def read_takeout(response) -> tuple[dict, dict[str, bytes]]:
    """The data.json of a takeout archive and its image files by hash."""
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        [folder] = {name.split("/")[0] for name in archive.namelist()}
        data = json.loads(archive.read(f"{folder}/data.json"))
        images = {
            name.removeprefix(f"{folder}/images/").removesuffix(".jpg"): archive.read(name)
            for name in archive.namelist() if name.startswith(f"{folder}/images/")
        }
    return data, images


@dataclass
class Catalog:
    muscle_group_id: int
    equipment_id: int
    muscle_ids: list[int]


@pytest.fixture
def catalog(db) -> Catalog:
    """A muscle group, an equipment and two muscles, which the migrations don't insert."""
    group = MuscleGroup(name="Chest")
    equipment = Equipment(name="Barbell")
    muscles = [Muscle(name="Pectoralis", image_url="a" * 64), Muscle(name="Triceps", image_url="b" * 64)]
    db.add_all([group, equipment, *muscles])
    db.commit()
    result = Catalog(group.id, equipment.id, [m.id for m in muscles])
    db.close()
    return result


@pytest.fixture
def make_exercise(db, catalog):
    """Inserts an exercise, by default a verified one (like the admin creates them) that tracks reps and weights."""
    def factory(name: str = "Bench Press", verified: bool = True, user_id: int | None = None, **tracks) -> int:
        tracked = {"reps": True, "weights": True, "time": False, "intensity": False, "distance": False, **tracks}
        exercise = Exercise(
            name=name, muscle_group_id=catalog.muscle_group_id, equipment_id=catalog.equipment_id,
            verified=verified, user_id=user_id, created_at=datetime.now(UTC), **tracked
        )
        db.add(exercise)
        db.commit()
        exercise_id = exercise.id
        db.close()
        return exercise_id

    return factory


def new_uuid() -> str:
    return str(uuid.uuid4())
