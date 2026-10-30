# Contributing to Gym 2.0

Thank you for wanting to help with Gym 2.0. Bug reports, ideas and pull requests are welcome.

## Before you start

- **Bugs and ideas:** open an issue with the bug report or the feature request form. For a bug, describe what
  happens, what you expected and how to reproduce it (device, iOS version or browser).
- **Larger changes:** open an issue first so we can agree on the approach before you spend time on it.
- **Security issues:** don't open a public issue. Report it privately as described in
  [SECURITY.md](SECURITY.md) instead, and give some time to fix the issue before you disclose it.

## The repository

| Folder | What it is |
| --- | --- |
| `ios/` | The iOS app (SwiftUI, SwiftData), see [ios/README.md](ios/README.md) |
| `web/` | The offline-first web app, see [web/README.md](web/README.md) |
| `backend/` | The FastAPI backend and the database migrations, see [backend/README.md](backend/README.md) |
| `infra/` | Production setup, the mail server and the backups, see [infra/README.md](infra/README.md) |

## Pull requests

- Keep a pull request to one topic and describe what it changes and why.
- Features that exist on both platforms should behave the same on iOS and the web.
- Add or update tests where they exist (for example `web/src/**/*.test.ts`) and make sure they pass.
- Don't commit secrets, `.env` files or personal data.
- Only submit code you wrote yourself or that is under a license compatible with the AGPL v3. Name the source and
  license of any code you take from elsewhere.

## Commit messages

Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <summary>

<body>

<footers>
```

The first line is at most 72 characters. The summary is in the imperative ("add", not "added" or "adds"), starts
with a lowercase letter and has no period at the end. The body comes after a blank line, is wrapped at 72 characters
and explains what changed and why: what was wrong or missing, what the change does about it and anything a reviewer
wouldn't expect. Leave it out only for changes that explain themselves, like a typo.

| Type | For |
| --- | --- |
| `feat` | Something new for the users or the admin, also new endpoints of the API |
| `fix` | A bug fix, also security fixes and corrections of the terms of use or the privacy policy |
| `perf` | A change that only makes something faster or use less memory |
| `refactor` | A change to the code that doesn't change what it does |
| `test` | Only tests |
| `docs` | Only documentation: the READMEs, ARCHITECTURE.md, comments |
| `build` | Dependencies, Dockerfiles, the compose files, the Xcode project settings |
| `ci` | The GitHub workflows |
| `chore` | Anything else that doesn't change the apps, e.g. the version number of a release |
| `revert` | Reverts an earlier commit, the body names its hash |

The scope is the part of the repository: `ios`, `web`, `backend` or `infra` (which includes the mailserver and the
backups). Leave it out when a commit changes several of them, e.g. a feature on both platforms or the root README.

A breaking change gets a `!` before the colon and a `BREAKING CHANGE:` footer that says what has to be done. Breaking
means that an older app version stops working (see [Branches and releases](#branches-and-releases)) or that a
deploy needs more than the release steps, e.g. a new required variable in `.env`. Other footers are `Fixes #<issue>`,
which closes the issue on GitHub, and `Co-authored-by:`.

```
fix(ios): keep the keyboard open when sending a chat message

The message field was disabled while a message was pending, which
includes the moment it is being sent, so it lost the focus and the
keyboard closed on every send. It's now only disabled while a message
waits to be sent again, e.g. offline.
```

```
feat(infra)!: send the account emails through an SMTP relay

The mailserver logged in to the mailbox of EMAIL_USER for every email,
which the provider limits to 100 emails a day.

BREAKING CHANGE: set SMTP_RELAY_HOST in .env before deploying.
```

Pull requests are squash merged, so the title of a pull request becomes the first line of its commit and follows the
same format. The "PR title" check ([pr-title.yml](.github/workflows/pr-title.yml)) checks it; after you fix the
title, it runs again by itself.

## Branches and releases

- Pull requests go into `main`, which should always be releasable. Keep the branch of a pull request short-lived, and
  bring `main` into it rather than keeping it open for long.
- `prod` is the version of the server stack (backend, web, mailserver and backup) that runs in production. It only
  moves forward to commits of `main` when the maintainer deploys and never gets commits of its own. Each deploy is
  tagged `server-<date>`, see [Releases](infra/README.md#releases) in the infra README.
- Each iOS version submitted to the App Store is tagged `ios-v<version>+<build>`. A `release/ios-<version>` branch
  only exists while a fix has to go into a version that `main` has moved past, see
  [Releases](ios/README.md#releases) in the iOS README.

The API has to stay compatible with older apps: many users update the iOS app late, so an app version is still in use
months after the next one is released, and it keeps calling the API it was built for. So:

- Within an API version (`/v1`), only add endpoints and optional fields. Don't remove or rename anything and don't
  change what a field means. A breaking change needs a new API version.
- A migration that removes or renames something comes in two releases: the first one stops using the old column or
  table, a later one removes it. Then the previous server version still works on the new schema, so a deploy can be
  rolled back.

## License and Contributor License Agreement

Gym 2.0 is licensed under the [GNU Affero General Public License v3](LICENSE) with an additional permission for app
stores and an attribution requirement, see [NOTICE](NOTICE).

Before a pull request can be merged, you need to sign the [Contributor License Agreement](CLA.md) (CLA) once. A bot
asks you to do so on your first pull request; you sign by replying with a comment. You keep the copyright in your
contributions. The CLA gives the maintainer the right to use them in Gym 2.0, including in the App Store version and
under other licenses in the future, and confirms that you're allowed to contribute them.
