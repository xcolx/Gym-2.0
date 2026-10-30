#!/usr/bin/env bash
# Tests the backup and both restores of infra/README.md (Backups) end to end with the real images, run by CI:
#   1. a migrated and seeded database and some images are backed up with backup.sh to an offsite-backup server
#   2. the append-only endpoint must refuse to delete the snapshot
#   3. the offsite restore (restic restore + restore-dump.sh) into an empty database must give the same database and images
#   4. the local restore (restore-dump.sh of the dump in /backups) over the changed database must undo the change
# Needs only Docker. Run from anywhere in the repository; everything it creates is removed at the end.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

id="gym2-restore-test-$$"
network="$id"
src_db="$id-src-db"
dst_db="$id-dst-db"
offsite="$id-offsite"
backups="$id-backups"
images="$id-images"
backup_image="$id-backup"
offsite_image="$id-offsite"
work=$(mktemp -d)

cleanup() {
  docker rm -f "$src_db" "$dst_db" "$offsite" >/dev/null 2>&1 || true
  docker volume rm "$backups" "$images" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$backup_image" "$offsite_image" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

step() { echo "--- $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Runs a command in the backup image, with the environment of the backup service of docker-compose.prod.yml. The
# healthcheck URL refuses connections, backup.sh only logs that.
backup() {
  local db="$1"
  shift
  docker run --rm --network "$network" \
    -e PGHOST="$db" -e PGUSER=gym2 -e PGDATABASE=gym2_db -e PGPASSWORD=test_db_password \
    -e RESTIC_REPOSITORY="rest:http://$offsite:${RESTIC_PORT:-8000}/gym2/" \
    -e RESTIC_REST_USERNAME=gym2 -e RESTIC_REST_PASSWORD="${RESTIC_REST_PASSWORD:-append_only_password}" \
    -e RESTIC_PASSWORD=test_repository_password -e BACKUP_HEALTHCHECK_URL=http://127.0.0.1:9/ \
    -v "$backups:/backups" -v "$images:/data/images:ro" \
    "$backup_image" "$@"
}

# The data as plain SQL (with a fixed key instead of the random one pg_dump 18 writes into every dump), and the schema
# from the catalog: a schema-only dump isn't the same after a restore, Postgres writes some CHECK constraints back in
# an equivalent but different form
dump() {
  backup "$1" pg_dump --data-only --restrict-key=restoretest
  docker exec "$1" psql -X -A -t -v ON_ERROR_STOP=1 -U gym2 -d gym2_db -c "
    SELECT 'column', table_name, column_name, data_type, is_nullable, coalesce(column_default, '')
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'constraint', conrelid::regclass::text, conname, contype::text, '', ''
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL SELECT 'index', tablename, indexname, indexdef, '', '' FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY 1, 2, 3"
}

# Same as the db service of docker-compose.prod.yml
start_db() {
  docker run -d --name "$1" --network "$network" \
    -e POSTGRES_USER=gym2 -e POSTGRES_PASSWORD=test_db_password -e POSTGRES_DB=gym2_db postgres:18-alpine >/dev/null
  # Over TCP, which the temporary server of the image's initialization doesn't listen on
  for _ in $(seq 60); do
    docker exec "$1" pg_isready -q -h 127.0.0.1 -U gym2 -d gym2_db && return
    sleep 1
  done
  fail "$1 didn't start"
}

psql_in() { docker exec -i "$1" psql -q -v ON_ERROR_STOP=1 -U gym2 -d gym2_db; }

step "building the images"
docker build -q -t "$backup_image" -f infra/backup/Dockerfile . >/dev/null
docker build -q -t "$offsite_image" infra/offsite-backup >/dev/null

docker network create "$network" >/dev/null
docker volume create "$backups" >/dev/null
docker volume create "$images" >/dev/null

step "starting the database and the offsite-backup server"
docker run -d --name "$offsite" --network "$network" -e REPO_USER=gym2 \
  -e APPEND_ONLY_PASSWORD=append_only_password -e FULL_ACCESS_PASSWORD=full_access_password "$offsite_image" >/dev/null
start_db "$src_db"
docker run --rm --network "$network" -v "$PWD/backend/db/migrations:/flyway/sql:ro" flyway/flyway:13-alpine \
  -url="jdbc:postgresql://$src_db:5432/gym2_db" -user=gym2 -password=test_db_password -connectRetries=60 -q migrate

step "seeding the database and the images"
psql_in "$src_db" <<'SQL'
INSERT INTO equipment (name) VALUES ('Barbell'), ('Dumbbell');
INSERT INTO musclegroup (name) VALUES ('Chest'), ('Legs');
INSERT INTO "user" (user_name, email, created_at, uses_ios, uses_web, weight_unit, distance_unit, active, bodyweight)
VALUES ('alice', 'alice@example.org', now(), true, false, 0, 0, true, 72.5),
       ('bjørn', NULL, now() - interval '1 year', false, true, 1, 1, true, NULL);
INSERT INTO friend (user_id_1, user_id_2, since) VALUES (1, 2, now());
INSERT INTO exercise (name, description, aliases, muscle_group_id, equipment_id, verified, reps, weights, "time",
                      intensity, distance, created_at)
VALUES ('Bench Press', E'Line one\nLine two – with ünïcode', '{"Flat Bench"}', 1, 1, true, true, true, false, false,
        false, now());
SQL
# backup() mounts the images read-only, as the backup service does
docker run --rm -v "$images:/data/images" "$backup_image" sh -c '
  head -c 200000 /dev/urandom > /data/images/a.webp && head -c 3000 /dev/urandom > /data/images/b.webp'
dump "$src_db" > "$work/before.sql"

step "backing up"
# rest-server answers (401) once it listens
backup "$src_db" sh -c 'for i in $(seq 30); do curl -s -o /dev/null "http://'"$offsite"':8000/" && exit; sleep 1; done; exit 1' ||
  fail "the offsite-backup server didn't start"
backup "$src_db" restic init -q
backup "$src_db" backup.sh
[ "$(backup "$src_db" sh -c 'ls /backups/*.dump.enc | wc -l')" -eq 1 ] || fail "backup.sh didn't write one dump"
backup "$src_db" sh -c '! grep -q "PostgreSQL database dump" /backups/*.dump.enc' || fail "the dump isn't encrypted"

step "checking that the append-only endpoint can't delete snapshots"
# restic exits with 0 even when the server refuses to remove the snapshot (403), so only the count tells
backup "$src_db" restic forget -q latest >/dev/null 2>&1 || true
[ "$(backup "$src_db" restic snapshots -q --json | grep -o '"id"' | wc -l)" -eq 1 ] ||
  fail "the append-only login deleted the snapshot"

step "restoring from the offsite repository into an empty database"
start_db "$dst_db"
backup "$dst_db" restic restore -q latest --target /backups/restore
backup "$dst_db" sh -c 'restore-dump.sh /backups/restore/backups/gym2-*.dump*'
dump "$dst_db" > "$work/offsite.sql"
diff -u "$work/before.sql" "$work/offsite.sql" || fail "the database restored from offsite differs"
backup "$dst_db" diff -r /data/images /backups/restore/data/images || fail "the images restored from offsite differ"

step "restoring the local dump over the changed database"
psql_in "$src_db" <<'SQL'
INSERT INTO equipment (name) VALUES ('Kettlebell');
DELETE FROM friend;
UPDATE "user" SET bodyweight = 80 WHERE user_name = 'alice';
SQL
backup "$src_db" sh -c 'restore-dump.sh /backups/gym2-*.dump.enc'
dump "$src_db" > "$work/local.sql"
diff -u "$work/before.sql" "$work/local.sql" || fail "the database restored from the local dump differs"

echo "backup and restore OK"
