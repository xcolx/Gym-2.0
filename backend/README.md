# Gym 2.0 backend

The REST API (`/v1`) of the iOS and the web app, the admin interface and the database migrations. FastAPI,
SQLAlchemy, PostgreSQL with [Flyway](https://flywaydb.org) migrations, Python 3.14.

How the code is organized (endpoints, services, queries, schemas) and its conventions are described in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Running it

The simplest way is the development stack of the repository root, which starts the database, applies the migrations
and runs the backend:

```bash
docker compose up -d db flyway backend
```

| URL | What it is |
| --- | --- |
| http://localhost:5000/v1 | The API |
| http://localhost:5000/docs | The OpenAPI docs (not in production) |
| http://admin.localhost:5000 | The admin interface, served on `ADMIN_HOST` |

To run the backend outside Docker, e.g. with `--reload`, start only the database and the migrations and run uvicorn
from `backend/`:

```bash
docker compose up -d db flyway
cd backend
python3.14 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL=postgresql://admin:dev_password@localhost:5432/gym2_db NUDITY_FILTER_MODEL_PATH= \
  .venv/bin/uvicorn app.main:app --reload --port 5000
```

An empty `NUDITY_FILTER_MODEL_PATH` turns the nudity check of uploaded images off, which only development allows. To
keep it on, download [640m.onnx](https://github.com/notAI-tech/NudeNet/releases/tag/v3.4-weights) and set the path
to it.

A new account needs a verified email. Without the mail server (it needs `EMAIL_USER` and `EMAIL_PASS`), activate it in
the database:

```bash
docker exec gym_db_dev psql -U admin -d gym2_db -c "UPDATE \"user\" SET active = true WHERE email = '<email>';"
```

A fresh database has no muscles, equipment or exercises; add them in the admin interface.

## Configuration

The settings are read from environment variables, or from a `.env` file in `backend/`, see
[app/core/config.py](app/core/config.py) for all of them and their defaults. The important ones:

| Variable | Default | What it is |
| --- | --- | --- |
| `DATABASE_URL` | | The PostgreSQL database, required |
| `ENVIRONMENT` | `development` | `development`, `staging` or `production`. Outside development the cookies are secure, in production the API docs are off |
| `SECRET_KEY` | placeholder | Derives the email verification tokens, required in production (`openssl rand -hex 32`) |
| `MAILSERVER_URL` | `http://localhost:5003` | The internal mail server ([infra/mailserver](../infra/mailserver)) |
| `ADMIN_HOST` | `admin.localhost` | The host name the admin interface is served on |
| `IMAGE_STORAGE_PATH` | `/data/images` | Where uploaded images are stored |
| `NUDITY_FILTER_MODEL_PATH` | `/opt/nudenet/640m.onnx` | NudeNet's model, part of the Docker image. Empty turns the check off (development only) |
| `OLLAMA_URL`, `OLLAMA_MODEL` | the production server and model | The Ollama server and model that answer the AI chat |
| `DEPRECATED_API_VERSIONS`, `RETIRED_API_VERSIONS` | `[]` | API versions that make the apps show an update notice or require an update |

The production values are set in [docker-compose.prod.yml](../docker-compose.prod.yml) and the root
[.env.example](../.env.example).

## Database migrations

The schema only changes through the Flyway migrations in [db/migrations](db/migrations), named
`V<n>__<description>.sql`. The `flyway` service applies them before the backend starts, both in development and in
production. A migration that has been applied is never edited, add a new one instead. If Flyway reports a checksum
mismatch in development, the local database was migrated with an older script: remove the `postgres_data` volume
(`docker compose down -v`) to start with an empty one.

## Jobs

[app/jobs/prune.py](app/jobs/prune.py) removes old data every day at 01:00 UTC; it runs as the `maintenance` service
of the compose files. To run it once right away:

```bash
docker compose run --rm maintenance python -m app.jobs.prune --once
```

## Testing

The pytest suite in [tests](tests) runs against a real PostgreSQL database migrated by Flyway, passed in
`DATABASE_URL`. It empties every table after each test and refuses to run against a database with accounts it didn't
create, so use a separate database, not the development one. From the repository root:

```bash
docker compose up -d db
docker exec gym_db_dev psql -U admin -d postgres -c "CREATE DATABASE gym2_test"
docker run --rm --network host -v "$PWD/backend/db/migrations:/flyway/sql" flyway/flyway:13-alpine \
  -url=jdbc:postgresql://localhost:5432/gym2_test -user=admin -password=dev_password migrate
cd backend
python3.14 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL=postgresql://admin:dev_password@localhost:5432/gym2_test .venv/bin/pytest
DATABASE_URL=postgresql://admin:dev_password@localhost:5432/gym2_test .venv/bin/pytest --cov   # with coverage
.venv/bin/ruff check . && .venv/bin/mypy   # lint and type check, no database needed
```

The tests never leave the machine: emails, the AI chat and the NudeNet check of uploaded images are stubbed, and images
are written to a temporary directory. To also run the real NudeNet model once, set `NUDENET_TEST_MODEL` to the path of
[640m.onnx](https://github.com/notAI-tech/NudeNet/releases/tag/v3.4-weights). After a change to the migrations, drop
and recreate the test database.

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs ruff, mypy, the migrations and `pytest --cov` on every
push and pull request to `main`. `--cov` fails when the coverage drops below `fail_under` in `pyproject.toml`, raise it
when the coverage grows.
