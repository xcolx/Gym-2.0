# Gym 2.0 web: architecture

An offline-first web clone of the iOS app (`ios/Gym 2.0/`, the source of truth) for Android users. Next.js 16 (App
Router, Turbopack), React 19, Tailwind 4, TypeScript, Dexie (IndexedDB) and the FastAPI backend in `backend/`.

Every screen reads and writes a **local database of the logged-in user**. The sync engine (`lib/sync`, see
[Sync engine](#sync-engine-libsync)) pushes local changes and pulls the server's, exactly like `SyncService.swift`.
Features never call the API to change synced data (exercises, workouts, schemes, settings), they call the repo
functions.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000, proxies /api/* to BACKEND_URL (default http://localhost:5000)
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest run (unit tests of src/lib, IndexedDB via fake-indexeddb)
npm run licenses   # scripts/generate-licenses.mjs, see Third-party licenses
npm run build      # the licenses, next build, then scripts/generate-sw.mjs writes the service worker public/sw.js
```

`BACKEND_URL` is documented in `.env.example` (copy it to `.env.local`). It is read at runtime by the server
(`src/proxy.ts`), not by `next build`, see [Backend proxy](#backend-proxy).

## Folder layout

```
web/
  next.config.ts            output "standalone", body size limit of the proxy, security headers, no-cache header of /sw.js
  vitest.config.mts         unit tests: src/**/*.test.ts, TZ=Europe/Zurich
  .env.example              BACKEND_URL, TRUSTED_PROXY_HOPS
  scripts/generate-sw.mjs   writes public/sw.js after next build (scripts/sw/routes.mjs + worker.js), see "PWA"
  public/                   manifest.webmanifest, icons/ (app icons for Android), images/ (bundled body images)
  src/
    proxy.ts                /api/:path* → BACKEND_URL/:path* at runtime (same-origin proxy, lib/backend-proxy.ts)
    types/models.ts         the local data model, mirror of VersionedSchemaV3.swift (+ joined view types)
    app/                    routes (App Router). Every data page is a client component ("use client"). A page stays thin:
                            it reads its params and renders the screen component of components/<tab>/, which holds the
                            markup and gets its state, data access and actions from a hook next to it (use-*.ts)
      layout.tsx            <AppShell> around every page
      page.tsx              the landing page at / (metadata, JSON-LD + components/landing), a server component rendered
                            alone for everyone (isOpenRoute)
      robots.ts, sitemap.ts, opengraph-image.tsx   robots.txt, sitemap.xml and the link preview image, see "Search
                            engines and crawlers"
      privacy/, tos/        the legal pages (metadata + components/legal), server components rendered alone for everyone
      licenses/             the third-party licenses (web only), like the legal pages, see "Third-party licenses"
      not-found.tsx         unknown routes and notFound() (e.g. a row deleted by a sync), inside the AppShell
      error.tsx             errors thrown while a page renders, "Try Again" / "Go to Home", inside the AppShell
      global-error.tsx      errors of the AppShell itself, own <html>, "Reload" (components/shell/StatusScreen.tsx)
      auth/page.tsx         AuthView (components/auth)
      home/                 HomeView
      chat/                 ChatsView, [chatId] (ChatView), [chatId]/info, friends, groups, ai (Gym-AI)
      workout/              WorkoutView entry, free, schemes/{add,[schemeId],[schemeId]/edit}, suggested, active/[workoutId]
      stats/                StatsView, distribution, exercises, facts, past-workouts/[workoutId]/edit
      settings/             SettingsView, account/{username,email,password}, blocked-users, sync-problems
    components/
      ui/                   the shared SwiftUI building blocks, see "Shared UI components", and the components every
                            tab uses: HighlightedBody, PhotoViewer, ServerImage, ProfileIcon, LegalPage
      shell/                AppShell.tsx, TabBar.tsx (RootView + MainView), the status and update screens
      landing/              LandingPage.tsx and its sections (server components): LandingHeader, Hero, StartButton,
                            Features, Showcase, PrivacySection, FinalCallToAction, LandingFooter, SectionTitle, brand.ts
      legal/                PrivacyPolicy.tsx, TermsOfUse.tsx: the texts of /privacy and /tos (built with ui/LegalPage),
                            ThirdPartyLicenses.tsx + third-party-licenses.json (generated): /licenses
      auth/                 AuthScreen.tsx (switches the views), LoginView, SignUpView, ForgotPasswordView,
                            CheckEmailView, AuthParts.tsx (AuthHeader, AuthButton), use-auth-forms.ts (their hooks)
      workout/              the workout tab, also SetTable.tsx, EditWorkoutExercise.tsx (NumberInsertView,
                            EditWorkoutExerciseView: performing and past workouts), EditWorkout.tsx, ExercisesSheet.tsx
                            and the parts of the performing workout (PerformingExercise.tsx, WorkoutPager.tsx, ...)
        active/             ActiveWorkoutScreen.tsx (WhilstWorkoutView), WorkoutTimer.tsx, use-active-workout.ts
                            (useActiveWorkout: leaving when closed here or elsewhere, useWhilstWorkout: cancel, end, edit)
      chat/                 the chat tab: the shared parts (ChatScreen, messages, images, chat-controls, ReportDialog,
                            NewGroupSheet, AIChat, ...) and one folder per screen
        list/               ChatsScreen.tsx, ChatRow.tsx, AIConversationsBanner.tsx, use-friend-request-count.ts
        conversation/       ChatConversationScreen.tsx (ChatView), ChatComposer, PendingMessage, PhotoCompose,
                            use-chat-conversation.ts (draft, sending, polling, the menu of a message)
        info/               ChatInfoScreen.tsx, MembersSection, GroupSection, AddMembersSheet, use-chat-info.ts
                            (useChatInfo, useAddMembers), use-group-section.ts
        friends/            FriendsScreen.tsx, AddFriendSection, FriendRequestsSection, FriendsListSection,
                            use-friends-screen.ts, use-context-menu.tsx (long press / right click → ActionSheet)
        groups/             PublicGroupsScreen.tsx, PublicGroupRow.tsx, use-public-groups.ts
      stats/                the stats tab
        past-workout/       PastWorkoutDetailScreen.tsx, PastWorkoutExerciseList.tsx, use-past-workout-detail.ts,
                            EditPastWorkoutScreen.tsx, use-edit-past-workout.ts (the draft of EditPastWorkoutView)
      home/, settings/      components of one tab
    lib/
      store.ts              createStore/useStore: tiny observable value (the web @Observable)
      uuid.ts               newUUID(), also outside secure contexts
      app-color.ts          --app-color CSS variable from the user's schemeColor
      site.ts               SITE_URL (https://gym2.app), the App Store ID and URL, INDEXED_ROUTES
      use-online.ts         useOnline(): navigator.onLine as hook
      use-now.ts            useNow(interval): the current time for durations, one shared clock per interval
      use-wake-lock.ts      useWakeLock(active): keeps the screen on during a workout
      navigation.ts         goBack (back buttons: pop if the previous entry is the parent, else open it), popTo
      use-bound-text.ts     useBoundText: a text field bound to a stored value (follows syncs, keeps the typing)
      use-local-storage.ts  per-device value (@AppStorage), e.g. for the appearance setting
      workout-last-change.ts last change of a workout in progress on this device (WorkoutLastChange.swift), not synced
      theme.ts, use-app-theme.ts   AppTheme: light/dark/system per device (<html data-theme>), APP_THEME_SCRIPT
      backend-proxy.ts      backendUrl(), backendTarget(), forwardToBackend() of src/proxy.ts
      pwa/                  service-worker.ts (registration, waiting update, applyUpdate), install-prompt.ts
      api/                  network layer (Core/Networking + the network methods of Core/Services)
        client.ts           send/sendVoid/sendForBlob, Endpoint, formData, onUnauthorized, API_BASE_PATH (/api/v1)
        errors.ts           ApiError (APIError.swift), isRejection, parseErrorBody
        app-update.ts       appUpdateStore/useAppUpdate: 410 → update required, Deprecation header → notice
        case.ts             snake_case <-> camelCase of JSON bodies
        dto/                DTO types (Core/Networking/DTOs/*.swift, checked against backend/app/schemas)
        services/           one object per iOS service: exerciseApi, workoutApi, workoutSchemeApi, userApi,
                            friendApi, chatApi, aiApi, authApi, imageApi (+ imageUrl, detectImageUpload)
        mapping.ts          DTO <-> model (DTO+Mapping.swift)
      db/                   Dexie
        schema.ts           GymDB (tables + indexes), PendingDeletion, PendingSchemePerformance, MetaValues
        connection.ts       openUserDb/closeUserDb/deleteUserDb, getDb/requireDb/useDb, dbStore, persist()
        sync-meta.ts        pending deletions, pending scheme performances, sync times, meta values
      repo/                 what features use
        write.ts            write() transaction helper (+ requestSync), changedState, NotFoundError
        exercises.ts, workouts.ts, schemes.ts, user.ts, chats.ts    local mutations
        settings-feature.ts profile image and username after the online account changes
        stats-feature.ts    exercise history, planning a workout file import (also the legacy one)
        queries.ts          plain reads (usable in live queries and outside React)
        hooks.ts, chat-hooks.ts   useLiveQuery hooks (the web @Query)
      sync/                 the sync engine (SyncService, ChatSync, UserSync), see "Sync engine"
      chat/actions.ts       the online friend, block and group actions (FriendActions.swift, the group views)
      auth/                 session.ts (AuthService.swift), routes.ts, validation.ts
      domain/               UI-independent logic (Core/Domain, DateFormatting.swift, pure parts of the views and models),
                            also the pure decisions of the screens: auth-forms.ts (when a form can be sent),
                            chat-confirmations.ts (the confirmation dialogs of the chat info and friends), chat-screens.ts
                            (message menu, addable friends, user search), past-workout-draft.ts (the edit of a past
                            workout), workout-end.ts (the suggested end), id-set.ts (immutable sets of ids)
    test/fixtures.ts        model builders for tests
```

Import from the barrels where convenient: `@/lib/api`, `@/lib/db`, `@/lib/repo`, `@/lib/auth`,
`@/lib/sync` (`<SyncRunner>` from `@/lib/sync/SyncRunner`). Dependencies point one way: `lib/sync` and `lib/chat` build
on `lib/repo`, which must never import `lib/sync/engine` or `lib/chat` (only `lib/sync/registry`).

## Data flow

```
UI (app/, components/)
  │ read:  hooks (useWorkout, useScheme, ...) ── useLiveQuery ──┐
  │ write: repo functions (startWorkout, setSetValue, ...)       │ re-render on every change
  ▼                                                              │
lib/repo ── one Dexie transaction: change rows, set syncState,   │
  │          record pendingDeletions / pendingSchemePerformances │
  │          then requestSync()                                   │
  ▼                                                              │
IndexedDB "gym2-user-<id>" (lib/db) ─────────────────────────────┘
  ▲
  │ push (syncState != synced, pendingDeletions, ...) / pull (GET /<type>/delta, GET /<type> for everything)
sync engine (lib/sync, registers via lib/sync/registry) ── lib/api ── /api/v1/* ── src/proxy.ts ── backend /v1/*
```

Online-only actions (friends, chat actions, AI, account changes, profile image) call `lib/api` directly and then store
the result locally with the repo helpers named in the iOS views (`storeUser`, `updateStoredUser`, `deleteChatLocally`,
...). The friend, block and group actions are in `lib/chat/actions.ts` (see [Chat](#chat)): they sync everything
afterwards or store a chat with its new members, both through the sync engine.

### Ids and sync state (read this before touching data)

- Models changeable offline (`Exercise`, `Workout`, `WorkoutExercise`, `WorkoutScheme`) have a local primary key `id`
  (random UUID, never sent), a nullable `serverId` (null until pushed), a `clientUUID` (sent with creates so a
  repeated create returns the existing object) and `syncState`: `"synced" | "created" | "updated"`
  (`"deleted"` exists for parity with Swift but is never used: deleted rows are removed right away and their server id
  goes to `pendingDeletions`).
- Relationships use local ids: `WorkoutExercise.workoutId`, `WorkoutExercise.exerciseId`, `WorkoutSchemeExercise.schemeId/exerciseId`.
  `exerciseId` can be null (the exercise was deleted, SwiftData nullifies).
- Server-only models (`User`, `Muscle`, `MuscleGroup`, `Equipment`, `Chat`, `Message`) use `serverId` as key,
  `ChatMember` uses `[chatId, userId]`. Exercises store reference data as server ids (`muscleGroupId`, ...): resolve them
  with `useReferenceData()` and `lib/domain/exercise.ts`.
- A change marks a synced row `updated` (`changedState()`), a never-pushed row stays `created`. Workout changes mark
  the workout and/or the changed workout exercises like `markChanged()` on iOS.
- Units: the database always stores kilograms, meters and seconds. Convert with `lib/domain/units.ts` right before
  showing or after entering a value. Dates are `Date` objects. UUIDs are lowercase strings.
- IndexedDB can't index booleans or null: filter `inProgress`, `isCurrentUser`, ... in JS.

### The database

`openUserDb(userId)` is called by the session (never by features). One database per user (`gym2-user-<id>`),
so a second account never mixes data and unpushed changes of a user stay until that user logs in again.
`navigator.storage.persist()` is requested once per page load. If IndexedDB can't be opened (blocked storage, some
private windows) `dbStore` is `"unavailable"` and the AppShell shows "Storage unavailable" instead of the app.
Schema changes need a new `this.version(n).stores(...)` in `schema.ts` (never edit version 1 after release).

## Auth and session (`lib/auth/session.ts`, `components/shell/AppShell.tsx`)

- `useSession()` → `{ status: "loading" | "restoring" | "signedIn" | "signedOut", userId, currentUser }`.
  The cookie is HTTP-only, so the logged-in user id is kept in `localStorage["gym2.session"]`. At start the session is
  `restoring` with that user's database open (works offline), then GET /users/me confirms it (`signedIn`); a 401 makes
  it `signedOut` but keeps the database; offline it stays `restoring` and is checked again when the browser goes online
  or the page becomes visible. The sync only runs while `signedIn` (`canSync(session, dbName)`): the cookie is shared
  by the tabs and replaced by every login, so a database is never synced before /users/me confirmed that the cookie
  belongs to its user. `login()` forgets the stored user and closes its database before the login request, so a login
  that fails half way (e.g. /users/me) can't leave the previous user stored with the new user's cookie.
- `AppShell` (in the root layout): starts the session, redirects signed-out users from every route except `/auth*`
  (`isPublicRoute`) to `/auth` and signed-in users from `/auth` to `/home`, renders the open routes (`isOpenRoute`: the
  landing page at `/`, the privacy policy at `/privacy`, the terms at `/tos` and the licenses at `/licenses`) alone for everyone without redirects, renders nothing until the database is open,
  shows the update-required screen (410, `components/shell/UpdateScreens.tsx`), the "Update available" alert
  (Deprecation header or a waiting service worker, at most once a day), applies the app color (the default red while
  signed out) and the appearance of the device, registers the service worker and keeps the install prompt.
- Functions: `login(email, password)` (opens the DB; throws ApiError: 401 wrong credentials, 403 with
  `code === "EmailVerificationError"`), `signUp(email, password, username)` → message, `resendVerificationEmail(email)`
  → message, `forgotPassword(email)` → message, `refreshCurrentUser()`, `logout({ force? })`,
  `deleteAccount(password)` (online, then removes the database), `handleSessionEnded()`. Changing the email is not a
  session function: the email page calls `userApi.changeEmail(email, password)` and the server only switches to the new
  address once its confirmation link was opened, the session stays.
- `logout()` first calls `pushPendingChanges()`. If that returns false it does nothing and returns
  `{ loggedOut: false, reason: "unpushedChanges" }`: show `UNPUSHED_CHANGES_MESSAGE` with "Try Again" / "Log Out Anyway"
  (`logout({ force: true })`) / "Cancel" like AccountSettingsView. A normal logout deletes the user's database; a forced
  one after a failed push keeps it so the changes are uploaded with the next login (as the iOS message promises).
- Every 401 of a request (except the login) ends the session (`onUnauthorized` in the client).
- Password reset: the "Forgot password?" screen of /auth calls `forgotPassword(email)` (POST /auth/forgot-password),
  which always answers with the same message. The emailed link opens a plain HTML page served by the backend
  (GET/POST /v1/auth/reset-password), not a page of the web app: it sets the new password and logs the user out on
  all devices, so the web app needs nothing else. There is no OAuth login yet (only stubs in the backend).
- The web client logs in as `client: "web"` (`AUTH_CLIENT`), which the backend only records (`uses_web`). Every client
  gets the same session lifetime: at least 30 days and at most 2 years, in between valid while the API was used within
  7 days (the browser keeps the cookie at most 400 days), see backend `SESSION_*`. Expired sessions show the login
  again, local data is kept.

## Backend proxy

The browser only talks to the web app's origin. `src/proxy.ts` (Next 16 proxy, the former middleware, Node.js runtime)
forwards `/api/:path*` to `BACKEND_URL/:path*` (`/api/v1/users/me` → `$BACKEND_URL/v1/users/me`) with
`forwardToBackend()` of `lib/backend-proxy.ts`: it sends the request itself with `fetch` (method, headers incl. the
session cookie, `x-forwarded-host`, the body: JSON or multipart up to `proxyClientMaxBodySize` = 20 MiB, what the reverse proxy lets
through in production; the backend takes images up to 20 MiB) and returns the backend's response unchanged (status, headers, every Set-Cookie, streamed
body). Hop-by-hop headers, `host` and `Expect` aren't forwarded, and neither are the forwarding headers a client can
fake (`Forwarded`, `X-Real-IP`, `X-Forwarded-*`): `x-forwarded-host` is set from `Host`, and `X-Forwarded-For` (the
backend's rate limits and login IP use it) only from trusted reverse proxies: `TRUSTED_PROXY_HOPS` (default 0) keeps
the last N entries of the incoming X-Forwarded-For (and passes their `X-Forwarded-Proto`); with 0 none is sent, since
Next.js 16 gives the proxy no client address of its own (it only sets `x-forwarded-for` to the socket address when the
client sent none, `??=`, so a client's value can't be told apart). **Deployment rule:** `TRUSTED_PROXY_HOPS` is the
number of proxies in front of the web server that append to X-Forwarded-For, and the web port must only be reachable
through them. Production (docker-compose.prod.yml) has two, Cloudflare and Traefik: the header arrives as
"<anything the client sent>, <client>, <Cloudflare>" and `TRUSTED_PROXY_HOPS=2` forwards the last two. The backend
then reads it from the right and skips the proxies it trusts (uvicorn's `FORWARDED_ALLOW_IPS`: the reverse proxy, the
compose network and Cloudflare), so the first address it doesn't trust is the client. A request that skipped Cloudflare
gets its header replaced by Traefik and arrives as "<client>" alone, which works with the same setting. Without it the
backend sees every web user with the web server's address (one rate limit for all). A backend that can't be reached is answered with 502,
one that takes longer than 95 s (`BACKEND_TIMEOUT_MS`; the backend waits up to 90 s for the AI, Cloudflare gives up
after 100 s) with 504, both with a JSON
`detail` the client shows. It doesn't use `NextResponse.rewrite(external URL)`: Next.js adds the header
`x-middleware-rewrite` with the rewritten (internal backend) URL to every such response and has no option to leave it
out. `BACKEND_URL` is read per request, so the production image is built without it and gets it at runtime, e.g.
`BACKEND_URL=http://backend:5000` on the web service of docker-compose.prod.yml (default `http://localhost:5000`).
Next.js answers `/api/...` with a trailing slash with a 308 to the path without it before the proxy runs (the API
paths have none).
`next dev` also accepts `http://<name>.localhost:<port>` (`allowedDevOrigins`) to keep the cookies of several local
servers apart (cookies of `localhost` are shared across ports).

## PWA (installable, opens and navigates offline)

- `public/manifest.webmanifest` (name, icons incl. maskable ones made from `assets/Icon`, standalone, start `/home`),
  linked by the root layout. On Android, Chrome's `beforeinstallprompt` is kept by `lib/pwa/install-prompt.ts` and the
  settings show "Install App" while it can be installed.
- The service worker `public/sw.js` is generated by `scripts/generate-sw.mjs` after `next build` (gitignored, part of
  `npm run build`, so the Docker build copies it with `public/`). Only production builds register it
  (`lib/pwa/service-worker.ts`, from the AppShell); `next dev` has none.
- Install: precaches every file of `.next/static` (the JS/CSS of all routes, without source maps), `public/` except
  `images/` and the HTML of every page. A dynamic route (`/workout/schemes/[schemeId]`) is precached once as a template
  rendered with a placeholder (`/workout/schemes/__gym2_param_schemeId__`); offline, `/workout/schemes/<id>` is answered
  with the template and the placeholder replaced in the HTML and its RSC payload, so `useParams()` works (values of
  `[A-Za-z0-9._~%-]` only; catch-all routes aren't supported). Routes with `generateStaticParams` are precached page by
  page. `public/images` (11 MB of body images) is cached in the background after the start and on use. Hashed
  `/_next/static` files are copied from the previous version's cache instead of downloaded again.
- Fetch: never handles `/api/*` (no API response is cached by the worker), except the stored images
  (`/api/v1/images/<hash>`): an image never changes under its hash, so they're kept in the cache `gym2-images`, cache
  first, also offline and across deployments. A changed image of an exercise, user or chat has a new hash and is loaded
  then. `lib/pwa/image-cache.ts` removes the images nothing in the database references after every pull (unreferenced
  ones only once they're older than 7 days, e.g. the images of public groups) and all of them on logout.
  Navigations: network first (3 s timeout, also on 5xx) with the precached page as fallback, unknown pages → the
  precached 404. RSC requests of client-side navigations go to the network; offline they fail and Next falls back to a
  full navigation, which the worker answers from the precache. Precached files are served cache first.
- Updates: a deployment is a new `sw.js` (version hash of the build). The browser finds it on navigations, the app also
  checks when it comes back to the foreground (at most every 30 min). The new worker installs and waits, the app shows
  "Update available" (once a day, shared with the Deprecation notice); "Update" (also on the 410 screen) lets it take
  over (`SKIP_WAITING`) and reloads every tab. After "Later" it takes over once every tab of the app is closed. The local
  database is never touched, unpushed changes are pushed by the next sync.
- New routes need nothing: the generator reads `.next/app-path-routes-manifest.json` and the prerender manifest.
- Running the production build locally: `npm run build`, copy `.next/static` to `.next/standalone/.next/static` and
  `public` to `.next/standalone/public` (like infra/web.Dockerfile), then
  `PORT=3106 BACKEND_URL=http://localhost:5000 node .next/standalone/server.js`. Service workers need a secure
  context: `localhost` and `*.localhost` count as one. The built-in browser of the Claude desktop app doesn't register
  service workers at all; verify the offline mode in Chrome.

## Security headers (`next.config.ts`)

Every page and file except `/api/*` gets a Content-Security-Policy, a Permissions-Policy and `X-Frame-Options: DENY`.
The CSP only allows the app's own origin (plus `blob:`/`data:` images for photo previews and the muscle masks) and
forbids framing. Scripts and styles need `'unsafe-inline'` (the inlined page data of Next.js, the theme and color
scripts, style attributes); `next dev` also allows `'unsafe-eval'` and `ws:`. A feature that loads something from
another origin (a font, an analytics script, an external image) needs its directive extended, otherwise the browser
blocks it and logs a CSP error. The Permissions-Policy switches off what the app doesn't use and keeps the screen wake
lock of the running workout. HSTS, `X-Content-Type-Options` and `Referrer-Policy` are set for every host by the
reverse proxy (homeserver-infra, `security-headers`), the backend sets its own CSP on the API responses
(`SecurityHeadersMiddleware` in backend/app/main.py).

## Third-party licenses (`/licenses`)

The licenses of MIT, ISC, Apache-2.0 and the others require their texts and notices to be passed on with the code, and
the JavaScript bundle is passed on to every browser (the minifier removes the license comments). `/licenses` lists the
packages with their license files, linked from the settings (About the Developer) and the footer of the landing page.
`scripts/generate-licenses.mjs` writes `components/legal/third-party-licenses.json` from package-lock.json and
node_modules: the dependencies of package.json, tailwindcss (its preflight is part of the CSS) and what they depend
on, without optional and peer dependencies (server-only platform binaries such as sharp and SWC). It runs before
`next build`. Run `npm run licenses` after changing dependencies and commit the file, since typecheck and the tests
run without a build. Web only: the iOS app uses no third-party packages. Like the other open routes, the page is a
server component and has `X-Robots-Tag: noindex`.

## Search engines and crawlers (`lib/site.ts`)

Only the open routes are meant for search engines: `/`, `/privacy` and `/tos` (`INDEXED_ROUTES`). They are server
components with a title, a description and a canonical URL (`metadataBase` = `SITE_URL` in the root layout), and they
are the only entries of `/sitemap.xml` (app/sitemap.ts). `/robots.txt` (app/robots.ts) allows every crawler, search
engines and AI crawlers alike, and only disallows `/api/`. Every other page gets `X-Robots-Tag: noindex`
(next.config.ts), since it needs an account and is empty for a crawler; it is deliberately not disallowed in
robots.txt, because a crawler that may not fetch a page never sees the header. A new public page needs an entry in
`INDEXED_ROUTES`, an exception in that header's `source` and its own `alternates.canonical`.

The landing page also has the Smart App Banner of Safari (`itunes` metadata, the App Store ID of the iOS app), the
structured data of the app as JSON-LD (`WebApplication`), and links to the App Store in the hero and the footer.
`app/opengraph-image.tsx` renders the 1200×630 link preview at build time for every route, `public/llms.txt` describes
the app in Markdown for AI assistants. Keep the texts of llms.txt in line with the landing page.

## Appearance (`lib/theme.ts`, AppTheme.swift)

Light, dark or system, per device in `localStorage["appTheme"]` (`useAppTheme()`), applied as `<html data-theme>` by
an inline script before the first paint and by the AppShell. `globals.css` switches the tokens and redefines Tailwind's
`dark:` variant with it, so use `dark:` (not `@media (prefers-color-scheme)`) for dark styles. Tokens: `bg-background`,
`text-foreground`, `text-app` / `bg-app` (the app color), `bg-grouped` and `bg-cell` (the background of a Form and its
cells; a sheet makes both lighter in the dark appearance like iOS), `text-secondary-label`, `bg-field`,
`border-separator`, `my-black` / `my-white`.

Dates and numbers are formatted with `appLocale()` of `lib/domain/format.ts`: English with the region of the browser
(`en-CH` for `de-CH`), like `Locale.current` of the iOS app, which is only localized in English.

## API layer (`lib/api`)

- Same-origin paths: `API_BASE_PATH = "/api/v1"`. The API version is the path prefix, like the iOS base URL
  `https://api.gym2.app/v1` (there is no version header). The routes are REST style: plural resource nouns in
  kebab-case and the HTTP method as the verb (`GET /workouts`, `GET /workouts/delta`, `POST /workouts`,
  `PATCH /workouts/{id}`, `DELETE /workout-exercises/{id}`, `POST /workout-schemes/{id}/performances`,
  `POST /chats/{id}/messages`, `PUT /chats/{id}/read-marker`, `GET /users/me/friends`, ...). Each service file lists
  its routes, `services/services.test.ts` checks the method and path of every request. `credentials: "include"`, `cache: "no-store"`, 30 s timeout
  (AI send: 100 s, health: 5 s).
- JSON bodies are converted: requests camelCase → snake_case with null/undefined properties left out (Swift's
  Encodable omits nil; the update endpoints reject explicit nulls), responses snake_case → camelCase. DTOs therefore
  use the Swift names (`clientUuid`, `exerciseId`, ...), except `ChatDTO.groupChat` / `ChatDTO.public` (wire names).
  DTO dates are ISO strings, `lib/api/mapping.ts` turns them into `Date` (`parseServerDate`).
- Multipart endpoints (exercise create/update, group chat create/update, send message, profile image) are built with
  `formData()`: lists as repeated fields, booleans "true"/"false". Uploads are `ImageUpload { data: Blob, filename, mimeType }`,
  `detectImageUpload(blob)` detects JPEG/PNG/WebP/HEIC like `ImageUpload(detecting:)`.
- Errors: `ApiError` with `kind` `"transport" | "unauthorized" | "server" | "updateRequired" | "decoding" | "invalidResponse"`,
  `status`, `code` (backend error class, e.g. `"ExerciseNotFoundError"`) and a user-facing `message`.
  `isRejection(error)`: 4xx except 408/429 (the sync drops/rolls back such changes instead of retrying).
- Images: `imageUrl(hash)` → `/api/v1/images/<hash>` usable as `<img src>` (cookie sent, immutable cache);
  `imageApi.imageData(hash)` for processing (in-memory cache).
- Services (all return promises of DTOs):
  - `exerciseApi`: `all, changes(syncTime), create(draft, image?), update(id, draft, image?), delete(id), equipment, muscleGroups, muscles`
  - `workoutApi`: `all, changes, create(newWorkout), update(id, update), delete, deleteExercise(id)`. A workout is
    finished or continued with `update` and `inProgress`. `update` (PATCH /workouts/{id}) also creates and updates the
    workout's exercises: `update.exerciseChanges` is a list of `{ op: "create", ...draft }` and
    `{ op: "update", id, ...fields }` that the server applies in order after the workout fields, in one transaction
    (if one fails, nothing is saved). It returns the whole workout, created exercises are found by their client UUID.
    Workout exercises are deleted separately (DELETE /workout-exercises/{id}).
  - `workoutSchemeApi`: `all, changes, create, update, markPerformed(id), delete`
  - `userApi`: `me, user(id), lookup(username), updateProfile, updateProfileImage(image), changeUsername, changePassword, changeEmail, deleteAccount, dataTakeout`
  - `friendApi`: `friends, removeFriend, friendRequests, sentFriendRequests, sendFriendRequest, answerFriendRequest(senderId, accept), deleteFriendRequest, blockedUsers, block(userId), unblock`
  - `reportApi`: `report({ reportedUserId | reportedChatId | reportedMessageId }, reason)`
  - `chatApi`: `all, changes, createDirectChat(userId), createGroupChat(name, memberIds, isPublic?, image?), updateGroupChat(id, name?, image?), addMembers, removeMember(userId, chatId), deleteChat, setPublic(isPublic, chatId), publicChats, join, sendMessage(chatId, { text?, image?, clientUuid? }), deleteMessage(messageId), markRead(chatId, messageId)`
  - `aiApi` (server-only data, no local tables): `conversations, conversation(id), createConversation(title?), renameConversation, deleteConversation, send(content, conversationId, clientUuid?)`
  - `authApi` (use `lib/auth` instead)
- Mapping (`mapping.ts`, pure, tested): `exerciseFromDTO, exerciseDraft, workoutExerciseDraft, workoutExerciseUpdateRequest,
  newWorkoutRequest, workoutUpdateRequest, workoutExerciseFromDTO, applyWorkoutDTO (→ workout + rows to put + ids to delete),
  sortedSchemeExercises, newSchemeRequest, schemeUpdateRequest, applySchemeDTO, userFromDTO(dto, existing, includingSettings),
  profileUpdate, chatFromDTO, chatChanged, replaceChatMembers, messageFromDTO, muscleFromDTO, muscleGroupFromDTO,
  equipmentFromDTO, findMatching (server id first, client UUID second), serverName, clampDuration, parseServerDate`.

## Repo functions (`lib/repo`) — the write API

All run in one transaction on the current user's database and call `requestSync()` afterwards (unless noted).
They throw `DbNotOpenError` without a database and `NotFoundError` for an unknown id.

Exercises (`exercises.ts`, CreateExerciseView):
- `createExercise(input: ExerciseInput, pendingImages?)` → new unverified exercise (`created`); the images are uploaded by the sync in their order.
- `updateExercise(id, input, images?)` — changes a custom exercise; tracked metrics only while not in use; `images` (`{ imageUrls, pendingImages }`: the uploaded images to keep, then the new ones) undefined keeps the current ones.
- `deleteExercise(id)` — deletes, records the pending deletion, removes it from schemes. UI only offers it while `useExerciseInUse` is false.

Workouts (`workouts.ts`):
- `getWorkoutsInProgress()` — newest first; check it is empty before starting a workout (FreeWorkoutView guard).
- `startWorkout(name, exerciseIds)` → in-progress workout, one empty set per exercise (bodyweight as default weight for "Body"/"Pull Up Bar" equipment). Free workouts without name use `DEFAULT_FREE_WORKOUT_NAME`.
- `startWorkoutFromScheme(schemeId, name, exerciseIds)` — same + `markSchemePerformedIn`.
- `finishWorkout(id)` → `{ duration, deleted }` — duration = minutes since start, removes empty sets/exercises, deletes the workout if nothing is left (EndWorkoutView / `Workout.save`).
- `deleteWorkout(id)` — cancel a running or delete a past workout (pending deletion of the workout only).
- `continueWorkout(id)` → false if another workout is in progress (PastWorkoutDetailViewModel).
- `renameWorkout(id, name)` — trimmed, empty keeps the old name (EditPerformingWorkoutView).
- `saveEditedWorkout(draft)` — the "Save" of EditPastWorkoutView: stores the draft and marks only what changed, removed exercises are deleted.
- `addExercisesToWorkout(workoutId, exerciseIds)` — appended with one empty set each.
- `removeExerciseFromWorkout(workoutExerciseId)` — pending deletion, following indexes move up (not marked).
- `reorderWorkoutExercises(workoutId, orderedIds)` / `moveWorkoutExercise(workoutId, from, to)` — marks moved rows.
- `addSet(id)`, `removeLastSet(id)` (always keeps one set), `setSetValue(id, metric, entryIndex, value)` (stored units, reps/time rounded), `setUnilateral(id, unilateral)` (converts entries).
- `importWorkouts(workouts: ImportedWorkout[])` — finished workouts from an import file (validation is the feature's job, see WorkoutFile.swift).

Schemes (`schemes.ts`):
- `createScheme(name, exerciseIds)`, `updateScheme(id, name, exerciseIds)` (replaces the list), `deleteScheme(id)`,
  `markSchemePerformedIn(db, id)` (inside a transaction: lastPerformed now + pending scheme performance; not a `syncState` change).

User (`user.ts`, UserSettings.swift):
- `setBodyweight(kg)` (one decimal), `setWeightUnit(unit)`, `setDistanceUnit(unit)`, `setSchemeColor(hex)` — only if changed; no-op before the first sync loaded the current user.
- After online actions (no sync request): `storeUser(dto, flags?)`, `updateStoredUser(serverId, changes)`.
- `DEFAULT_SCHEME_COLOR`, `isHexColor`, `currentUserIn(db)`.

Chats (`chats.ts`, ChatSync.swift):
- `setChatInput(chatId, text)` (local draft, no sync), `queueChatInput(chatId)` → UUID (marks the input as sent; the sync engine sends it with that UUID until accepted). Features send with `sendChatMessage` of lib/sync instead.
- `storeChat(dto)` / `storeChatIn(db, dto)` — upsert metadata, replace changed members, add new messages (pulls). After a create/join/update use `storeChatAndMembers` of lib/sync, which also loads new members.
- `deleteChatLocally(chatId)`, `removeChatMemberLocally(chatId, userId)` — after the online leave/delete/remove.

Settings and stats (`settings-feature.ts`, `stats-feature.ts`): `uploadProfileImage(userId, image)`,
`changeUsername(userId, username)`; `exerciseHistory(db, exerciseId)` / `useExerciseHistory`,
`planImportOfWorkoutFile(file)` and `planLegacyImportOfWorkoutFile(file)` (with `importWorkouts` of workouts.ts).

Writing your own: use `write((db) => [tables...], async (db) => { ... })`. **Inside a transaction only await Dexie
calls** or async helpers that await a Dexie call before returning; awaiting anything else (fetch, timers, an async
function that does no database work) loses the transaction and throws `PrematureCommitError`. A helper that may skip
all work returns `Dexie.Promise.resolve()` (see `addPendingDeletion`).

## Hooks (`lib/repo/hooks.ts`) — the read API

Every hook returns `undefined` while loading (render nothing or a placeholder), `null` for "not found" where noted.
They re-render on every change of the data they read (also from the sync or another tab).

- `useDbQuery(query, deps)` — build your own live query on the current database.
- Exercises: `useExercises()` (by name), `useExerciseMap()` (by local id), `useExercise(id)`, `useExerciseInUse(id)`.
- Reference data: `useMuscles()`, `useMuscleGroups()`, `useEquipment()` (by name), `useReferenceData()` (maps by server id).
- Workouts: `useFinishedWorkouts()` (with exercises, for stats), `useWorkoutsThisWeek()`,
  `useWorkoutsInProgress()`, `useWorkout(id)` (`WorkoutWithExercises`: sorted `workoutExercises`, each with `exercise`).
- Schemes: `useSchemes()` (by name, with ordered `exercises`), `useScheme(id)`.
- Users: `useCurrentUser()` (null before the first sync), `useUserSettings()` (`bodyweight, weightUnit, distanceUnit, schemeColor, isAvailable`),
  `useUsersById()`, `useFriends()`, `useBlockedUsers()`.
- Chats: `useChat(id)`, `useChatMessages(id)`,
  `useChatList(currentUserId)` (visible chats with unread counts), `useChatIds()`, `useCurrentUserId()` (stored user, else the session's).
- Plain reads for non-React code: `lib/repo/queries.ts` (`finishedWorkouts(db)`, `workoutWithExercises(db, id)`, `referenceData(db)`, `hasUnpushedChanges(db)`, ...).
- Other stores: `useSession()`, `useDbState()`, `useDb()`, `useAppUpdate()`, `useOnline()`, `useSyncState()`,
  `useSyncProblems()`, `useRejectedChanges()` (lib/sync).

## Sync engine (`lib/sync`)

A port of `SyncService.swift`, `ChatSync.swift` and `UserSync.swift`, tested against an in-memory backend
(`testing/fake-server.ts`). `SyncService` only coordinates, the push and pull steps are in one module per entity:

```
lib/sync/
  sync-service.ts         SyncService: starts, coalesces and serializes the runs, the order of the steps, the status,
                          the chat sends and polls. Its public API is what engine.ts and the tests use.
  context.ts              SyncContext (what the handlers get from SyncService: db, api, ensureRunning, transaction,
                          report, status, syncAgain), SyncStoppedError, sameJSON, loadDelta, exercisesByServerId
  deletions.ts            pushDeletions(ctx, kinds): the pending deletions
  exercise-sync.ts        ExerciseSync: push (with the pending images), pull
  scheme-sync.ts          WorkoutSchemeSync: push, pushPerformances, pull
  workout-sync.ts         WorkoutSync: push (create, or one PATCH /workouts/{id} with the exercise changes), pull
  reference-data-sync.ts  pullReferenceData(ctx): muscles, muscle groups, equipment
  rejections.ts           didReject (rejected changes, rejectedCreates), deleteLocally (also used by the pulls)
  images.ts               comparing pending images, pruning the image cache after a pull
  chat-sync.ts            ChatSync (ChatSync.swift): chats, members, messages, queued inputs, read marks
  user-sync.ts            UserSync (UserSync.swift): current user, friends, blocked users, chat members, settings
  engine.ts, registry.ts, state.ts, lock.ts, chat-polling.ts, SyncRunner.tsx, api.ts (SyncApi), log.ts
  testing/                fake-server.ts (FakeServer), harness.ts (setupSyncTest: db, server and service per test)
```

The tests of a handler run through `SyncService` (`exercise-sync.test.ts`, `scheme-sync.test.ts`,
`workout-sync.test.ts`), `sync-service.test.ts` covers the coordination (first sync, settings, chats, full pulls,
running, stopping, lock).

- **Running it**: `<SyncRunner>` (mounted by the AppShell) calls `startSyncEngine(db)` while the session is confirmed
  (`signedIn`, not `restoring`) and the database of that user is open, and stops it on logout or a user switch. It syncs on start, 3 s after the last
  local change (`requestSync()` of every repo write; pulls only if the last pull is older than 60 s), when the page
  becomes visible or the browser goes online (pull if older than 15 s), every 5 min while visible, and right away when
  the page is hidden with a sync scheduled. One sync at a time across tabs (`lock.ts`: Web Locks, a localStorage lease
  as fallback). Whether a pull is due is decided after taking the lock, with the last pull date in the database (meta
  `lastPullDate`), so tabs syncing on the same trigger (e.g. online) pull once. A 401 (session ended) or 410 (update required) stops it until it's started again.
- **Push order** like iOS: deletions of workout exercises, workouts, schemes; exercises (with the pending images after the
  kept uploaded ones, again without them if the images are rejected); deletions of exercises; schemes; scheme performances; workouts (create, or
  one PATCH /workouts/{id} with the workout fields if they changed and the changed exercises as `exerciseChanges` in
  local index order, none if nothing changed); settings (`profileUpdate`); queued chat messages (a sync, a poll and
  `sendChatMessage` all send them through one coalesced run, so a tab never sends the same message twice at once). **Pull**: reference
  data, exercises, schemes, workouts (the delta, everything for the first pull and after a rejection), chats, users
  (current user, friends, blocked users, missing chat members). Rows with unpushed changes are never overwritten.
- **Rejections**: a change the server refuses (4xx except 408/429) isn't sent again. An update or deletion is replaced
  by the server's version with the next pull, a create stays local and is listed as a sync problem.
  Workout exercises whose exercise is gone (deleted on another device, `exerciseId` nullified by the pull) are removed
  before the workout is pushed (reported, the following ones move up), a 404 `ExerciseNotFoundError` of a workout
  push makes the same sync reload the exercises and push again (the batch is atomic, so none of that workout's
  changes were saved; the exercise's removal by the pull runs the sync once more without its rows). A workout exercise whose exercise has no server id is
  skipped (the other exercises and the workout are pushed, at their positions on the server); once the server rejected
  that exercise's create, the workout is listed in the sync problems (`blockedWorkouts`) until it can be pushed. Every rejection
  is reported once in `rejectedChanges` (rejected settings are replaced by the server's in the same sync, also one that
  doesn't pull), which the SyncRunner shows as the "Not saved" alert of MainView
  (`dismissRejectedChanges()` on OK). That includes a chat message the server rejected: it stays in the input field
  without its UUID.
- **State** (`state.ts`): `useSyncState()` → `{ state: "idle" | "syncing" | "failed", failureMessage, lastSyncDate,
  rejectedChanges, rejectedCreates, blockedWorkouts }`, `useSyncProblems()` (a failed sync on top, then the rejected
  creates and blocked workouts).
- **For features** (`engine.ts`): `sync()` (also "Sync Again"), `resync()` ("Manual Resync": push, then load everything),
  `syncChats()`, `sendChatMessage(chatId)` (queues the input and sends it right away, resolves with the chat
  afterwards), `sendChatPhoto(chatId, upload, caption)` (throws, photos aren't kept offline), `markChatRead(chatId)`
  (one request per chat and message at a time, failures ignored), `storeChatAndMembers(dto)`.
- **Polling** (`chat-polling.ts`, no push updates yet): the SyncRunner polls `syncChats()` every 3 s on every `/chat`
  route except the AI chats `/chat/ai*` (ChatsView, `pollsChats`), an open chat calls `useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS, { immediate: false })` (1 s, after
  marking it as read like ChatView). Only while the page is visible. A poll uses the chat delta; a delta that misses a
  chat loads all chats again at most every 30 s (`FULL_CHAT_RELOAD_INTERVAL_MS`, the backend allows 10 GET
  /chats per minute), in between the delta is applied without advancing its sync time.
- **Registry** (`registry.ts`): `requestSync()` and `pushPendingChanges(): Promise<boolean>` (used by `logout`).
  Until an engine registered, `requestSync()` does nothing and `pushPendingChanges()` resolves to
  whether the open database has nothing to push. lib/repo and lib/auth only depend on this file.

## Chat

- Messages go through the sync engine like on iOS (`SyncService.sendMessage/sendPhoto/markRead/store`), see above.
- `lib/chat/actions.ts` (FriendActions.swift, ChatInfoView, NewGroupChatView, PublicGroupsView, BlockedUsersView):
  `sendFriendRequest`, `cancelFriendRequest`, `answerFriendRequest`, `removeFriend`,
  `blockUser(id, { profile? })`, `unblockUser`, `report(target, reason, block?)` (a user, group or message, blocking the
  user first for "Block and Report…"; the ReportDialog of components/chat asks for the reason and sends it),
  `openDirectChat`, `createGroupChat`, `updateGroupChat`, `setGroupPublic`, `addGroupMembers`, `removeGroupMember`,
  `leaveGroup`, `deleteChat`, `joinPublicGroup`, `deleteMessage`. Friend actions update the stored users right away and then call
  `sync()` (`FriendActions.didChange`), chat actions store the returned chat with `storeChatAndMembers`.
- Deleting a message: a long press (or right click) on a bubble opens its menu, "Copy" for text and "Delete for
  Everyone" for the own messages (`deleteMessage`: DELETE /chats/messages/{id}, a soft delete, then removed locally).
  The other devices remove it with their next delta, which delivers it with `deletedAt` set and without text or photo
  (`storeChatIn` removes it, or never stores it). A full reload (GET /chats, `storeChatIn(..., { complete: true })`)
  also removes the stored messages it doesn't contain anymore, e.g. ones deleted in the admin.
- The AI conversations are server-only (`aiApi`, `lib/domain/ai-chat.ts`, components/chat/AIChat.tsx).

## Shared UI components (`components/ui`)

One implementation each, used by every tab. Overlays render into the body (`Portal`) and lock the page scroll.

- Every modal overlay (Sheet, FullScreenCover, Alert, ActionSheet, PhotoViewer) puts `ref={modalRef}` on its root:
  while it is open the rest of the body is `inert` (not focusable or clickable, hidden from screen readers), the focus
  moves into it and returns when it closes.
- `ui/overlay.tsx`: `Sheet({ open, onClose, label?, title?, leading?, trailing?, grouped? })` (`.sheet`: with a title or
  toolbar items it has the inline navigation bar and the children scroll, without them the children bring their own
  layout, e.g. ExercisesSheet), `SheetButton` (toolbar button, `bold` for the confirmation), `FullScreenCover`,
  `useBackToClose(open, onClose)` (the back button of Android closes the topmost sheet: a history entry per open
  overlay), `afterOverlayClose(action)` (navigate only after a closing overlay removed its history entry), `useEscape`,
  `useBodyScrollLock`, `Portal`, `useIsClient`.
- `ui/Alert.tsx`: `Alert({ open, title, message?, buttons, onClose, children? })` (`.alert`: two buttons side by side
  with cancel left, more stacked with cancel last; buttons `{ label, role?: "cancel" | "destructive", isDefault?,
  disabled?, onSelect? }`, `onSelect` runs after it closed), `MessageAlert({ title, message | null, onClose })` (OK only),
  `PromptAlert` (with a text field, e.g. rename and the ReportDialog of components/chat).
- `ui/ActionSheet.tsx`: `ActionSheet({ open, title, message?, buttons, onClose })` (`.actionSheet` /
  `.confirmationDialog`, scrolls long lists, closed by Cancel, outside, Escape and back).
- `ui/controls.tsx`: `Switch` (Toggle in the app color), `SegmentedPicker` (Picker(.segmented)), `Spinner`
  (ProgressView); `ui/AppColorSegmentedPicker.tsx` (AppColorSegmentedPicker.swift); `ui/Page.tsx`: `Page`,
  `PageHeader` (the navigation bar of every screen, large or `inline` title, `back`, `leading`/`trailing` toolbar
  items; back pops with `goBack(router, parentHref)` of `lib/navigation.ts`: history back if the previous entry is the
  parent, otherwise the parent replaces the screen, so back never leaves the app), `PillLink`, `PillButton`.
- `SetTable` (`{ workoutExercise, stopwatchWorkoutId? }`, the stopwatch only in the performing workout) and
  `EditWorkoutExercise` read the units and reference data themselves; the set fields are `lib/domain/set-input.ts`.
- `PhotoViewer` / `OpensPhotoViewer`, `ServerImage`, `ProfileIcon` / `ProfileCircle`.
- Forms and lists: `ui/Form.tsx` (`FormPage`, `FormStack` for the sections in a `grouped` sheet, `FormSection`,
  `FormRow` (content `className`, row `rowClassName` and props such as `onContextMenu`), `PressableRow` (a row that is
  a button with any content), `LinkRow`, `ButtonRow` (tinted or `destructive`, an icon may come first), `InputRow`),
  inset separators like iOS. Used by the settings, auth and chat screens. components/chat/chat-controls.tsx only keeps what
  the chat alone uses: `ContentUnavailable`, `Menu` and the button styles.

## Domain logic (`lib/domain`, pure, unit tested)

- `stats.ts` (StatsCalculator): `summaryOfWorkouts`, `summaryOfWorkoutExercises`, `metricAverage`, `formatDuration`, `formatTime`, `formatSetTime`, `formatIntensity`, `formatRecord`.
- `fuzzy-search.ts` (FuzzySearch): `fuzzyScore`, `fuzzyFilter(items, query, names)`; use `exerciseSearchNames` to include aliases.
- `units.ts` (Units): conversions, `formatWeight`, `formatDistance`, `formatVolume`, `formatNumber`, `unitOrMetric`.
- `password-policy.ts`: `passwordProblem(password)`.
- `interesting-facts.ts`: `interestingFacts({ workouts, equipment, muscleGroups, memberSince, weightUnit, distanceUnit, now?, weekStartsOn?, locale? })`, `formatCount`.
- `format.ts` (DateFormatting.swift): `formatDate` (dd.MM.yy), `timeFromDate` (HH:mm), `startOfWeek`, `firstWeekday`, `roundHalfAwayFromZero`,
  `appLocale()` (English with the browser's region), `characterCount` (unicode scalars like the server's limits), `prefixCharacters` (grapheme clusters like Swift's `prefix`).
- `relative-date.ts`: `formatRelativeNamed(date, now?)` (`.relative(presentation: .named)`).
- `set-input.ts` (NumberInsertView): `parseSetInput`, `formatSetInput`, `displaySetInput`, `setInputChange`, `setInputHeader`, `setLabel`, `toggleSign`, `secondsFromText`.
- Screens: `stats-screens.ts`, `muscle-distribution.ts`, `muscle-mask.ts`, `workout-file.ts` (WorkoutFile.swift import/export),
  `legacy-workout-import.ts` (LegacyWorkoutImport.swift: the CSV of earlier versions with the exercises matched by name),
  `exercise-form.ts` (CreateExerciseView), `stopwatch.ts`, `celebration.ts`, `chat-feature.ts` (chat views), `inline-markdown.ts`,
  `ai-chat.ts` (AIChatViewModel), `image-size.ts`, `profile-image-crop.ts`, `printf.ts`.
- `workout-exercise.ts` (WorkoutExercise+Helpers): set arrays — `entryCount`, `numberOfSets`, `totalReps`, `volume`, `trackedMetrics`, `startSets`, `appendEntry`, `removeEntry`, `convertEntries`, `valueOf`, `withValue`, `isEntryEmpty`, `entryDescription`.
- `workout.ts` (Workout+Helpers): `musclesTrained` (week, 3x secondary = primary), `musclesTrainedInWorkout`, `isInCurrentWeek`, `planFinishWorkout`, `MAX_WORKOUT_NAME_LENGTH`.
- `exercise.ts` (Exercise+Helpers): reference lookups, `exerciseUsesBodyweight`, `exerciseCanEdit`, `exerciseCanChangeTrackedMetrics`, `EXERCISE_LIMITS`, `BODYWEIGHT_EQUIPMENT_NAMES`.
- `set-metric.ts` (SetMetric): names, input ranges, server ranges.
- `chat.ts` (Chat+Helpers): `chatTitle`, `isChatHidden`, `sendingBlockedReason`, `otherMemberId`, `chatLastActivity`, `sortMessages`.
- `home.ts` (HomeView helpers): `timeWorkedOutShort`, `progressPercentage`, `notTrainedMuscles`. `suggest.ts`: `suggestExercises`.

## Conventions for feature agents

- Routes go in `src/app/<tab>/...` (tabs: home, chat, workout, stats, settings; auth UI in `src/app/auth/...`).
  Data pages are client components. Use the shared components of `components/ui` (Sheet, Alert, ActionSheet, Switch,
  ...) instead of building another overlay or control.
- Route folders only hold `page.tsx` and `layout.tsx` (and data of that one page, e.g. `app/stats/sections.ts`).
  Components go in `src/components/<tab>/` (e.g. `components/workout/WorkoutPager.tsx`), or in `components/ui/` when
  several tabs use them. Logic without UI goes into `lib/domain` with a `*.test.ts` next to it.
- Read with hooks, write with repo functions. Don't call `db.*` from components; add a hook/repo function instead:
  a new read = a function in `queries.ts` + a `useDbQuery` wrapper in `hooks.ts`; a new write = a function using
  `write()` that sets `syncState` with `changedState()` and records deletions with `addPendingDeletion`.
- Don't call the API to change synced data. Online-only actions call `lib/api` and store the result locally.
- Handle `undefined` (loading) from hooks; never assume reference data exists (empty before the first sync).
- Keep texts and behavior identical to the iOS views; name the Swift file in a comment (`/** Port of X.swift */`).
- Before committing: `npm run typecheck && npm run lint && npm test && npm run build`.

## Known gaps

All tabs are ported (home, chat incl. Gym-AI, workout, stats, settings) and were verified end to end against the local
backend, also offline. What is still different from iOS or left to do:

- No push updates: chats are polled (3 s list, 1 s open chat) while the page is visible, like the iOS app.
- Photos of chats and the AI chat need a connection (as on iOS); the profile image upload too.
- Exporting a file opens the share sheet only where the browser can share files (Android Chrome), otherwise it's a
  download; importing uses the file picker. The Legacy Import button of the import sheet reads the CSV export of earlier
  versions like on iOS. There is no import of the V2 data (LegacyImportView, iOS only: it uploads the data of the
  previous, offline-only iOS app version, which the web app never had).
- Default exercises come from the server (like iOS, which seeds nothing).

## iOS → web map

| iOS (`ios/Gym 2.0/`) | web (`web/src/`) |
| --- | --- |
| Core/Persistence/Schema/VersionedSchemaV3.swift, Typealiases.swift | types/models.ts, lib/db/schema.ts |
| Core/Persistence/CustomContainer.swift | lib/db/connection.ts |
| Core/Persistence/Extensions/Exercise+Helpers.swift | lib/domain/exercise.ts, set-metric.ts, lib/repo/hooks.ts (`useExerciseInUse`) |
| Core/Persistence/Extensions/Workout+Helpers.swift | lib/domain/workout.ts, lib/repo/workouts.ts |
| Core/Persistence/Extensions/WorkoutExercise+Helpers.swift | lib/domain/workout-exercise.ts, set-metric.ts, lib/repo/workouts.ts (sets) |
| Core/Persistence/Extensions/WorkoutScheme+Helpers.swift | lib/repo/schemes.ts, lib/api/mapping.ts (`sortedSchemeExercises`) |
| Core/Persistence/Extensions/Chat+Helpers.swift | lib/domain/chat.ts |
| Core/Networking/APIClient.swift, Endpoint.swift, MultipartFormData.swift | lib/api/client.ts, case.ts |
| Core/Networking/APIError.swift | lib/api/errors.ts |
| Core/Networking/DTOs/*.swift | lib/api/dto/*.ts |
| Core/Services/ExerciseService.swift | lib/api/services/exercises.ts |
| Core/Services/WorkoutService.swift | lib/api/services/workouts.ts |
| Core/Services/WorkoutSchemeService.swift | lib/api/services/workout-schemes.ts |
| Core/Services/UserService.swift, FriendService.swift | lib/api/services/users.ts |
| Core/Services/ChatService.swift | lib/api/services/chat.ts |
| Core/Services/AIService.swift | lib/api/services/ai.ts |
| Core/Services/AuthService.swift, Core/Storage/KeychainStore.swift | lib/auth/session.ts, lib/api/services/auth.ts |
| Core/Services/ImageService.swift | lib/api/services/images.ts |
| Core/Services/AppUpdateService.swift | lib/api/app-update.ts, lib/pwa/service-worker.ts |
| Core/Persistence/UserSettings.swift | lib/repo/user.ts, `useUserSettings()`, lib/app-color.ts |
| Core/Storage/AppTheme.swift | lib/theme.ts, lib/use-app-theme.ts |
| Core/Services/Sync/DTO+Mapping.swift | lib/api/mapping.ts |
| Core/Services/Sync/PendingDeletions.swift, PendingSchemePerformances.swift | lib/db/sync-meta.ts (+ tables in schema.ts) |
| Core/Services/Sync/SyncService.swift, ChatSync.swift, UserSync.swift | lib/sync/ (sync-service.ts and its handlers exercise-sync.ts, scheme-sync.ts, workout-sync.ts, deletions.ts, reference-data-sync.ts, rejections.ts; chat-sync.ts, user-sync.ts, engine.ts, SyncRunner.tsx), lib/repo/chats.ts (`storeChatIn`) |
| Core/Domain/*.swift | lib/domain/*.ts |
| Core/Utilities/DateFormatting.swift | lib/domain/format.ts |
| App/RootView.swift, MainView.swift | components/shell/AppShell.tsx, components/shell/TabBar.tsx, lib/sync/SyncRunner.tsx (sync, "Not saved"), components/workout/OpenWorkoutAtLaunch.tsx |
| Features/AppUpdate/UpdateRequiredView.swift | components/shell/UpdateScreens.tsx |
| Features/Auth/AuthView.swift | components/auth/, lib/auth/validation.ts, lib/domain/auth-forms.ts |
| Features/Home/*, DesignSystem/Components/PhotoViewer.swift | app/home/page.tsx, components/home/ |
| Features/Settings/* | app/settings/**, components/settings/, lib/repo/settings-feature.ts, lib/domain/profile-image-crop.ts |
| Features/Chat/* | app/chat/**, components/chat/, lib/chat/actions.ts, lib/domain/chat-feature.ts, ai-chat.ts |
| Features/Workout/* | app/workout/**, components/workout/ |
| Features/Stats/* | app/stats/**, components/stats/, lib/domain/stats-screens.ts, workout-file.ts, legacy-workout-import.ts, lib/repo/stats-feature.ts |
| Features/Settings/SyncProblemsView.swift, SettingsView (ResyncSection) | app/settings/sync-problems/page.tsx, components/settings/SettingsSections.tsx |
| DesignSystem/Components/* | components/ui/ (HighlightedBody, PhotoViewer, ServerImage, ProfileIcon, AppColorSegmentedPicker) |
| @Query | lib/repo/hooks.ts |

## Local backend for development

`docker compose up -d db flyway backend` from the repo root starts the backend on http://localhost:5000 (the default
`BACKEND_URL`). If flyway fails with a checksum mismatch, the existing `postgres_data` volume was migrated with an
older V1 script; use a fresh database instead. Without the mailserver no verification email arrives: activate a test
account in the local database with
`docker exec <db container> psql -U admin -d gym2_db -c "UPDATE \"user\" SET active = true WHERE email = '<email>';"`.

Test accounts of the local dev databases (created with POST /v1/auth/signup/email, password `Gym2-web-test!`):
`webtest@example.com` (the foundation), `agent-a@example.com` and `agent-e2@example.com` (the end-to-end run, the
second one chats via curl with a cookie jar against `/v1`), `agent-chat-a@example.com` and `agent-chat-b@example.com`
(friends in the group "Leg Day Crew", for checking the chat screens). Without seeded reference data a fresh database has no
muscles, equipment or exercises; add them in the admin (http://admin.localhost:5000).

End-to-end checklist (production build, mobile viewport, own host like http://smoke.localhost:3106 for own cookies):
login → home → create exercise → create scheme → start it → enter sets → end → stats and past workout → export and
import → settings (units, appearance, app color, Manual Resync) → chat with a second user (send, receive the polled
reply, a rejected message shows "Not saved") → sync problems → logout and login (the server's data comes back) →
offline: with the service worker installed stop the server and navigate and log a workout from the precache, or run
the server with an unreachable `BACKEND_URL` (502, "Sync failed" in the sync problems), then start it with the real
backend and check that the workout is on the server (GET /v1/workouts).
