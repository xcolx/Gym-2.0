#!/bin/sh
# Nightly backup: dumps the database to /backups (the newest 7 are kept on the host for quick restores, encrypted with
# RESTIC_PASSWORD, see restore-dump.sh), then pushes the dump and the images to the offsite restic repository. The
# repository is append-only for this host, old snapshots are removed from elsewhere (see infra/README.md, Backups). Reports
# start, success and failure to BACKUP_HEALTHCHECK_URL.
set -eu
set -o pipefail
# The dumps contain all user data, only root may read them
umask 077

# Without a trailing slash of the URL, which would make the pings go to .../<uuid>//start
ping() { curl -fsS -m 10 --retry 3 "${BACKUP_HEALTHCHECK_URL%/}$1" >/dev/null || echo "healthcheck ping failed" >&2; }

# Chained with &&, since set -e doesn't apply to a function called as an if condition
# The dump is encrypted as it is written, so it is never stored unencrypted. Keep the openssl options in sync with
# restore-dump.sh.
# Old dumps are removed by count, not age: the names sort by time, and -mtime depends on how long each pg_dump took.
# Grouped by host and tags, not paths: the dump has a new name every night, the previous snapshot is still the parent
# (so unchanged images aren't read again) and restic forget keeps one snapshot per day instead of every night's group
run() {
  dump="/backups/gym2-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
  find /backups -name 'gym2-*.dump.enc.tmp' -delete &&
    pg_dump -Fc | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:RESTIC_PASSWORD -out "$dump.tmp" &&
    mv "$dump.tmp" "$dump" &&
    find /backups -maxdepth 1 -name 'gym2-*.dump.enc' | sort -r | tail -n +8 | xargs -r rm -f &&
    restic backup --host gym2-prod --tag nightly --group-by host,tags "$dump" /data/images
}

ping /start
if run; then
  ping ""
else
  ping /fail
  exit 1
fi
