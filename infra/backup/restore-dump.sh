#!/bin/sh
# Restores a database dump of backup.sh into gym2_db, replacing its contents in one transaction (see infra/README.md, Restore).
# Usage: restore-dump.sh /backups/gym2-<time>.dump.enc
# Dumps from before the encryption (gym2-<time>.dump, still in older offsite snapshots) are restored as they are.
set -eu
set -o pipefail

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "usage: restore-dump.sh <dump file>" >&2
  exit 1
fi

case "$1" in
  *.dump.enc)
    # Same options as in backup.sh. pg_restore reads the archive in order, which works without seeking.
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:RESTIC_PASSWORD -in "$1" |
      pg_restore --clean --if-exists --single-transaction -d gym2_db
    ;;
  *.dump)
    pg_restore --clean --if-exists --single-transaction -d gym2_db "$1"
    ;;
  *)
    echo "not a dump of backup.sh: $1" >&2
    exit 1
    ;;
esac
echo "restored $1"
