<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gym 2.0 web

The offline-first web version of the iOS app for Android users. The iOS app (`../ios/Gym 2.0/`) is the source of
truth: texts and behavior should be the same on both platforms. The API is the FastAPI backend in `../backend/`.

**Read [ARCHITECTURE.md](./ARCHITECTURE.md) before changing anything.** It describes the folder layout, the data
model, the repo functions and hooks, the sync engine, the proxy, the PWA and the iOS → web map. Keep it up to date
when you change one of these.

## Commands

Run them in `web/`. CI (`.github/workflows/ci.yml`) runs the last four, all must pass before a commit.

```bash
npm run dev        # http://localhost:3000, proxies /api/* to BACKEND_URL (default http://localhost:5000)
npm run typecheck
npm run lint
npm test           # vitest, unit tests next to the code (src/**/*.test.ts)
npm run build      # next build + generates the service worker public/sw.js
```

Local backend: `docker compose up -d db flyway backend` in the repo root, see "Local backend for development" in
ARCHITECTURE.md.

## Rules

- Read data with the hooks of `lib/repo/hooks.ts`, change it with the repo functions of `lib/repo`. Components never
  call `db.*`, and never call the API to change synced data (exercises, workouts, schemes, settings).
- Inside a `write()` transaction only await Dexie calls, anything else throws `PrematureCommitError`.
- Hooks return `undefined` while loading. Reference data (muscles, equipment) is empty before the first sync.
- The database stores kilograms, meters and seconds. Convert with `lib/domain/units.ts` only for display and input.
- Schema changes need a new `version(n)` in `lib/db/schema.ts`, never edit a released version.
- Route folders (`src/app/`) only hold `page.tsx` and `layout.tsx`. Components go in `src/components/<tab>/` or
  `components/ui/` when several tabs use them. Logic without UI goes in `lib/domain/` with a test next to it.
- Use the shared components of `components/ui` (Sheet, Alert, ActionSheet, Form rows, PageHeader) instead of new ones.
- A port of an iOS view or helper names its Swift file in a comment (`/** Port of X.swift */`).
- Use the theme tokens (`bg-background`, `text-app`, ...) and `dark:` for dark styles, not
  `@media (prefers-color-scheme)`.
- Loading something from another origin needs the Content-Security-Policy in `next.config.ts` extended.
- Don't commit secrets, `.env*` files (except `.env.example`) or personal data. The repository is public.
