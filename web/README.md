# Gym 2.0 web

The offline-first web version of the iOS app, installable as a PWA and hosted at [gym2.app](https://gym2.app).
Next.js 16 (App Router), React 19, Tailwind 4, TypeScript and Dexie (IndexedDB).

Every screen works on a local database in the browser, and a sync engine exchanges its changes with the
[backend](../backend/README.md), so the app keeps working offline. The browser only talks to the web app's own origin:
the Next.js server proxies `/api/*` to the backend ([src/proxy.ts](src/proxy.ts)).

How the app is built (data model, local database, API layer, repo functions, hooks, auth, sync engine, PWA) and the
conventions for new features are described in [ARCHITECTURE.md](ARCHITECTURE.md). The iOS app is the source of truth
for how a screen looks and behaves, ARCHITECTURE.md maps its files to the web ones.

## Running it

The web app needs a backend. Start the one of the development stack from the repository root, then run the web app
with npm (Node.js 24):

```bash
docker compose up -d db flyway backend
cd web
cp .env.example .env.local
npm install
npm run dev     # http://localhost:3000
```

`docker compose up -d` in the repository root also starts the web app itself, in a container with hot reload.

To log in locally, sign up in the app and activate the account in the database, see
[backend/README.md](../backend/README.md#running-it).

## Configuration

The environment variables are documented in [.env.example](.env.example). They are read at runtime by the server, not
by `next build`, so the same build works everywhere.

| Variable | Default | What it is |
| --- | --- | --- |
| `BACKEND_URL` | `http://localhost:5000` | Base URL of the backend that `/api/*` is proxied to, without `/v1` |
| `TRUSTED_PROXY_HOPS` | `0` | How many reverse proxies in front of the web server are trusted to set `X-Forwarded-For` |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload on http://localhost:3000 |
| `npm run build` | Writes the third-party licenses, the production build (standalone output), then the service worker `public/sw.js` |
| `npm run licenses` | Writes `src/components/legal/third-party-licenses.json` for `/licenses`, run and commit it after changing dependencies |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | The Vitest unit and component tests once, `npm run test:watch` in watch mode |
| `npm run test:coverage` | The same with the coverage report (`coverage/index.html`), fails below the minimum |
| `npm run test:e2e` | The Playwright end-to-end tests against a local backend, see below |

## Testing

The unit tests (`src/**/*.test.ts`, Vitest, next to the module they test) cover the logic in `src/lib` (domain logic,
repo functions, sync engine, API layer, auth, PWA) and the hooks of a few screens. IndexedDB is replaced by
fake-indexeddb, so they need neither a browser nor a backend. The component tests (`src/**/*.test.tsx`) render
components in jsdom with Testing Library and click and type like a user; the ones of the workout screens store into
fake-indexeddb like the app. `src/test/setup-components.ts` replaces the router of Next.js for them.

`npm run test:coverage` fails when the coverage drops below the minimum in `vitest.config.mts`. Raise it when the
coverage grows.

Before a pull request, run what CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs:

```bash
npm run typecheck && npm run lint && npm run test:coverage && npm run build
```

### End-to-end tests

The Playwright tests in [e2e](e2e) sign up, log in, log workouts (also offline) and chat in a phone-sized Chromium,
against the real backend. `playwright.config.ts` starts the backend on port 5100 (with the Python of
`../backend/.venv`), the web app on port 3100 and [a fake mailserver](e2e/fake-mailserver.mjs) on port 5103 that
keeps the verification emails for the tests. The rate limits and the NudeNet check are off. Every test signs up its
own users, so the database is never emptied; it needs to be a separate one, migrated by Flyway. From the repository
root:

```bash
docker compose up -d db
docker exec gym_db_dev psql -U admin -d postgres -c "CREATE DATABASE gym2_e2e"
docker run --rm --network host -v "$PWD/backend/db/migrations:/flyway/sql" flyway/flyway:13-alpine \
  -url=jdbc:postgresql://localhost:5432/gym2_e2e -user=admin -password=dev_password migrate
cd web
npx playwright install chromium
npm run test:e2e
```

`E2E_DATABASE_URL` and `E2E_PYTHON` point the backend elsewhere. Servers already running on the ports are reused,
locally the web app runs with `next dev`, in CI the production build is tested. A failed test keeps a trace in
`test-results/`, open it with `npx playwright show-trace`.

## Deployment

[infra/web.Dockerfile](../infra/web.Dockerfile) builds the production image (`runner` target, `node server.js` of the
standalone build) and the development image (`dev` target). The production stack sets `BACKEND_URL` and
`TRUSTED_PROXY_HOPS` in [docker-compose.prod.yml](../docker-compose.prod.yml), see
[infra/README.md](../infra/README.md).
