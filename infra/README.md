# Gym 2.0 infrastructure

How the production stack is built, deployed, monitored and backed up. For running the stack locally, see
[Getting started](../README.md#getting-started) in the main README.

## Contents

| Path | What it is |
| --- | --- |
| [`backend.Dockerfile`](backend.Dockerfile) | The image of the backend and the `maintenance` job, includes NudeNet's model |
| [`web.Dockerfile`](web.Dockerfile) | The image of the web app: `dev` (hot reload, used by docker-compose.yml) and `runner` (the standalone production build) |
| [`mailserver/`](mailserver) | Sends the account emails (verification, email change, password reset, already registered), only reachable by the backend |
| [`backup/`](backup) | The nightly backup ([backup.sh](backup/backup.sh)) and the restore script ([restore-dump.sh](backup/restore-dump.sh)), see [Backups](#backups) |
| [`offsite-backup/`](offsite-backup) | The server on another machine that stores the encrypted backups, see [offsite-backup/README.md](offsite-backup/README.md) |

The compose files are in the repository root: [docker-compose.yml](../docker-compose.yml) for development and
[docker-compose.prod.yml](../docker-compose.prod.yml) for production. Every Dockerfile is built from the repository
root as the build context, except `offsite-backup/`, which is built from its own folder. CI builds all of them.

The production stack consists of these services:

| Service | What it does |
| --- | --- |
| `web` | The Next.js server on port 3000, proxies `/api/*` to the backend |
| `backend` | The API and the admin interface on port 5000 |
| `db` | PostgreSQL, data in `/data/postgres` |
| `flyway` | Applies the migrations of [backend/db/migrations](../backend/db/migrations) before the backend starts |
| `maintenance` | Removes old data every day at 01:00 UTC (`python -m app.jobs.prune`) |
| `mailserver` | Sends the emails, reachable only from the backend's internal network |
| `backup` | Dumps the database and sends it and the images offsite every night at 03:00 UTC |

## Deployment

All commands below run from the repository root. Production runs with
[docker-compose.prod.yml](../docker-compose.prod.yml). Its secrets are read from a `.env` file next to it, described
in [.env.example](../.env.example):

```bash
cp .env.example .env   # fill in every value
sudo mkdir -p /data/postgres /data/images /data/backups && sudo chown 999:999 /data/images
docker compose -f docker-compose.prod.yml up -d --build
```

The backend image contains NudeNet's 640m model (about 100 MB, downloaded with a pinned hash by
[infra/backend.Dockerfile](backend.Dockerfile)), which checks uploaded images for nudity. The backend loads it at
the start and doesn't start without it; it needs about 300 MB more memory, and each check takes about half a second on
`NUDITY_FILTER_THREADS` CPU threads (default 2). `NUDITY_FILTER_MODEL_PATH` points to it, only development may set it
empty to turn the check off.

Data is stored on the host in `/data/postgres` and `/data/images`. The containers log to the host's journal (Docker's
journald log driver), which has to delete them after at most 15 days, as the privacy policy says: set
`MaxFileSec=1day` and `MaxRetentionSec=14day` in `/etc/systemd/journald.conf.d/` (homeserver-infra's
`gym2-vm/bootstrap/prepare-host.sh` does this). TLS, the firewall and the public domains are
handled by the infrastructure in front of the stack (see [Known limitations](../README.md#known-limitations)). The admin interface
is served on its own host and has no authentication of its own, so access to it must be restricted by the reverse
proxy.

## Releases

The `prod` branch is the version that runs in production. All services of the stack are released together, since the
web app and the backend change together. To release, move `prod` forward to a commit of `main` whose CI run passed and
tag it `server-<UTC date>` (`server-<date>.2` for a second release on the same day):

```bash
git switch main && git pull
git tag server-2026.10.30
git push origin main:prod server-2026.10.30
```

The push is refused if `prod` isn't an ancestor of `main`, so `prod` never gets commits of its own. Then, in the
checkout of `prod` on the production host:

```bash
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build
```

To roll back, check out the tag of the previous release on the production host and start the stack again, then fix
the problem on `main` and release as usual (`git switch prod` before the next `git pull`):

```bash
git checkout server-2026.10.25
docker compose -f docker-compose.prod.yml up -d --build
```

Flyway ignores migrations that are applied but newer than the checked out code, so the previous version runs on the
newer schema. That works because migrations only remove something one release after the code stopped using it (see
[CONTRIBUTING.md](../CONTRIBUTING.md#branches-and-releases)). A backup only has to be restored when a migration lost
data, see [Restore](#restore).

Older iOS versions keep calling the API they were built for. Before an API version is removed, add it to
`DEPRECATED_API_VERSIONS` in `.env`, so the apps show an update notice, and later to `RETIRED_API_VERSIONS`, so they
only show the update screen. The traffic page of the admin interface shows how many requests each API version gets
and when it was last used.

## Monitoring

[UptimeRobot](https://uptimerobot.com) checks that the API and the website are reachable and alerts when one of them
goes down. The API is checked through its `/health` endpoint, which isn't counted in the request statistics (see
[backend/app/core/request_stats.py](../backend/app/core/request_stats.py)), so the checks don't skew them.

## Backups

The `backup` service of the production stack runs [infra/backup/backup.sh](backup/backup.sh) every night at 03:00 UTC:

1. `pg_dump` writes the database to `/data/backups/gym2-<time>.dump.enc` on the host, encrypted with `RESTIC_PASSWORD`
   (AES-256, readable only by root). Only the newest 7 dumps are kept.
2. [restic](https://restic.net) sends the new dump and `/data/images` to an offsite repository on a
   [rest-server](https://github.com/restic/rest-server) (setup in [infra/offsite-backup/](offsite-backup/README.md)).
   restic encrypts on this host, so the backup server only stores encrypted data, and it deduplicates, so the unchanged
   images cost nothing after the first run.
3. The result is reported to a [healthchecks.io](https://healthchecks.io) check, which alerts when a night fails or
   is missing.

The rest-server login on this host is **append-only**: it can add snapshots but not delete or change them, so a
compromised production host can't destroy its backups. Old snapshots are removed through a second endpoint of the
backup server with full access, which is only used from an admin machine (see Retention). Restricting that endpoint
to the admin machine is part of the backup server's setup, see
[Securing the full-access endpoint](offsite-backup/README.md#securing-the-full-access-endpoint).

### Setup

1. Set up the backup server and its two endpoints, see [infra/offsite-backup/README.md](offsite-backup/README.md).
2. Create a check on healthchecks.io (period 1 day, grace 2 hours) and fill in the `RESTIC_*` and
   `BACKUP_HEALTHCHECK_URL` values in `.env` (see [.env.example](../.env.example)). Store `RESTIC_PASSWORD` in a password
   manager as well: without it the backups can't be decrypted, e.g. when this host is lost.
3. Create the dump directory, initialize the repository and start the service:
   ```bash
   sudo mkdir -p /data/backups
   docker compose -f docker-compose.prod.yml run --rm backup restic init
   docker compose -f docker-compose.prod.yml up -d --build backup
   ```
4. Run a backup right away and check that it arrived:
   ```bash
   docker compose -f docker-compose.prod.yml exec backup backup.sh
   docker compose -f docker-compose.prod.yml exec backup restic snapshots
   ```

### Retention

Every month (and after the first week), from an admin machine with restic installed and the credentials of the
full-access endpoint, keep 7 daily, 4 weekly and 6 monthly snapshots and verify the repository. `--read-data-subset`
also reads and checks a random 5% of the stored data, so damage on the backup disk is noticed over time, not only when a
restore fails:

```bash
export RESTIC_REPOSITORY=rest:https://<full-access endpoint>/gym2/
export RESTIC_REST_USERNAME=gym2 RESTIC_REST_PASSWORD=<full-access password> RESTIC_PASSWORD=<repository password>
restic forget --host gym2-prod --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check --read-data-subset=5%
```

The full-access credentials never go on the production host. Data of a deleted account stays in the backups until
its last snapshot is removed, i.e. up to about 6 months.

### Restore

Stop everything that writes to the database first, including the nightly backup (it would otherwise upload a dump of
a half-restored database if 03:00 passes), and start the stack again afterwards. The restore commands below use
`run --rm`, which starts a one-off backup container (and `db`, if it isn't running) without the nightly schedule:

```bash
docker compose -f docker-compose.prod.yml stop web backend maintenance backup
# ... restore ...
docker compose -f docker-compose.prod.yml up -d
```

From a local dump of the last 7 days (`sudo ls /data/backups`), with
[infra/backup/restore-dump.sh](backup/restore-dump.sh), which decrypts it and replaces the database in one transaction:

```bash
docker compose -f docker-compose.prod.yml run --rm backup restore-dump.sh /backups/gym2-<time>.dump.enc
```

This only restores the database: images uploaded or removed since the dump stay as they are now.

CI tests the backup and both restores with [infra/backup/test-restore.sh](backup/test-restore.sh), which needs only
Docker and can be run locally as well: it backs up a seeded database and some images to an offsite-backup server,
checks that the append-only login can't delete the snapshot, restores from the repository into an empty database and
the local dump over a changed one, and compares the results with the original.

From the offsite repository, e.g. on a new host: set up `.env` and the directories as for a first start, but don't
start the stack, so no migrations run and no users write data before the restore. `latest` can be replaced by an id
from `restic snapshots`:

```bash
docker compose -f docker-compose.prod.yml run --rm backup restic restore latest --target /backups/restore
docker compose -f docker-compose.prod.yml run --rm backup sh -c 'restore-dump.sh /backups/restore/backups/gym2-*.dump*'
sudo rsync -a /data/backups/restore/data/images/ /data/images/ && sudo chown -R 999:999 /data/images
sudo rm -rf /data/backups/restore
```

