# Gym 2.0 backend: architecture

The REST API of the iOS app (`ios/Gym 2.0/`) and the web app (`web/`), plus the admin interface. FastAPI,
SQLAlchemy (sync sessions), PostgreSQL with Flyway migrations, slowapi rate limits.

## Commands

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 5000   # API at http://localhost:5000, docs at /docs in development
python -m app.jobs.prune                     # the nightly cleanup job
ruff check . && mypy                         # lint and type check, configured in pyproject.toml (CI runs both)
DATABASE_URL=postgresql://admin:dev_password@localhost:5432/<test db> pytest   # run from backend/, empties the db
```

The tests need a Postgres migrated with `db/migrations` (see `tests/conftest.py`). They refuse to run against a
database with users they didn't create.

ruff checks pycodestyle, pyflakes, import order, bugbear, pyupgrade and simplify rules; nothing is auto-formatted, so
don't run `ruff format`. mypy checks `app` and `tests` with the pydantic plugin and `check_untyped_defs`. A
`# type: ignore[code]` needs a specific code and is reported once it isn't needed anymore.

## Folder layout

```
backend/
  db/migrations/        Flyway migrations (V<n>__<name>.sql), the only place the schema changes
  app/
    main.py             the FastAPI app: middlewares, exception handlers, /health, /v1, the admin app on ADMIN_HOST
    api/health.py       GET /health (version-less)
    api/v1/router.py    mounts the endpoint routers of v1 under their prefixes
    api/v1/endpoints/   one router per resource: parse the request, rate limit, call one service function
    services/           the business logic, one module per resource. Raise app.core.errors, never HTTPException
    db/models.py        SQLAlchemy models
    db/queries/         the queries (crud), no business rules
    db/session.py       get_db: one session per request, committed before the response, rolled back on any error
    schemas/            Pydantic request and response models, the value limits (e.g. MAX_EXERCISES)
    core/               config, errors (AppException subclasses → JSON {error, detail}), deps (DbSession,
                        get_current_user), cookies, security, rate_limit, request_stats, content and nudity filters
    admin/              the sqladmin interface (dashboard, traffic, image moderation)
    jobs/prune.py       nightly cleanup (python -m app.jobs.prune)
    util/               small helpers (time, ids, logging)
  tests/                pytest against a real Postgres, one file per resource
  pyproject.toml        ruff and mypy settings (pytest's are in pytest.ini)
```

Layers: `endpoints → services → db/queries`. Endpoints don't query the database and services don't know about HTTP
(except the error classes, which the handlers in `main.py` turn into status codes). Use `DbSession` from
`app.core.deps` for the session, never `Depends(get_db)`.

## URL conventions

- Resource nouns in the path, the HTTP method is the verb (no `get_all`, `create`, `update/...`).
- Collections are plural, multi-word segments in kebab-case (`/workout-schemes`, `/muscle-groups`).
- A collection: `GET /things` (everything, with `sync_time`), `GET /things/delta?last_sync_time=` (changes since),
  `POST /things` (create, idempotent by `client_uuid`), `PATCH|PUT|DELETE /things/{id}`.
- Sub-resources and actions as nouns: `POST /chats/{id}/messages`, `PUT /chats/{id}/read-marker`,
  `POST /workout-schemes/{id}/performances`, `PUT /users/me/blocked-users/{id}`, `POST /chats/{id}/members/me`.
- Things of the current user live under `/users/me/...` (friends, friend requests, blocked users).
- `/v1/auth/*` keeps its action names (login, logout, signup, verify-email, reset-password): the emailed links
  point to them.
- Static routes are registered before the `/{id}` routes of the same router, otherwise `/{id}` catches them.

## Batched workout changes

`PATCH /v1/workouts/{workout_id}` takes the workout fields and `exercise_changes`, a list discriminated on `op`:
`create` (the fields of a workout exercise, inserted at `index`, idempotent by `client_uuid`) and `update` (`id` plus
the changed fields). In one transaction the workout is locked, its fields are applied, then every change in order
(`workout_service._create_workout_exercise` / `_update_workout_exercise`: same index shifting and validation as a
single change). Any error rolls back the whole request. The response is the full `WorkoutResponse`, so clients map
created exercises by `client_uuid`. Deleting is separate: `DELETE /v1/workout-exercises/{id}`.

## Health checks

There are two health checks on purpose: `/health` is version-less for infrastructure monitoring (Docker healthchecks,
reverse proxy), and every API version has its own `/vN/health` so clients can check the version they speak. Keep both.

## API versions

v1 is changed in place until the first production deployment. After that, breaking changes go into a new version;
old versions are deprecated (`Deprecation` header) and retired (410) through `DEPRECATED_API_VERSIONS` and
`RETIRED_API_VERSIONS` in the settings, also after their routes were removed.
