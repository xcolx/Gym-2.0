#!/bin/sh
# Writes the logins from the environment to one htpasswd file per endpoint and runs both rest-server instances. The
# container stops when one of them stops, so the restart policy brings both back.
set -eu

: "${REPO_USER:?REPO_USER must be set}"
: "${APPEND_ONLY_PASSWORD:?APPEND_ONLY_PASSWORD must be set}"
: "${FULL_ACCESS_PASSWORD:?FULL_ACCESS_PASSWORD must be set}"
if [ "$APPEND_ONLY_PASSWORD" = "$FULL_ACCESS_PASSWORD" ]; then
  echo "APPEND_ONLY_PASSWORD and FULL_ACCESS_PASSWORD must differ" >&2
  exit 1
fi

# Outside /data, so the htpasswd files are never part of a repository path
mkdir -p /config
umask 077
htpasswd -B -b -c /config/append-only.htpasswd "$REPO_USER" "$APPEND_ONLY_PASSWORD" 2>/dev/null
htpasswd -B -b -c /config/full-access.htpasswd "$REPO_USER" "$FULL_ACCESS_PASSWORD" 2>/dev/null
unset APPEND_ONLY_PASSWORD FULL_ACCESS_PASSWORD

# Each user only reaches the repository at /<user>/. No --max-size: each instance counts the size itself, so the
# append-only one would never see the space freed by a prune through the other and reject every backup at some point.
# A quota on the data directory limits the size instead (see README.md, Disk).
options="--path /data --private-repos"

# shellcheck disable=SC2086
rest-server $options --listen :8000 --append-only --htpasswd-file /config/append-only.htpasswd &
append_only=$!
# shellcheck disable=SC2086
rest-server $options --listen :8001 --htpasswd-file /config/full-access.htpasswd &
full_access=$!

stopping=
sleeper=
trap 'stopping=1; kill "$append_only" "$full_access" $sleeper 2>/dev/null || true' TERM INT

# Polls instead of wait -n, which busybox sh doesn't reliably return from when a child exits
while [ -z "$stopping" ] && kill -0 "$append_only" 2>/dev/null && kill -0 "$full_access" 2>/dev/null; do
  sleep 5 &
  sleeper=$!
  wait "$sleeper" || true
done

kill "$append_only" "$full_access" 2>/dev/null || true
wait "$append_only" "$full_access" 2>/dev/null || true
if [ -n "$stopping" ]; then
  exit 0
fi
echo "a rest-server instance stopped, stopping the container" >&2
exit 1
