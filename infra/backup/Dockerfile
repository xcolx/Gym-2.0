# Nightly backup of the database and the exercise images to an offsite restic repository (see infra/README.md, Backups).
# Based on the postgres image of the db service, so pg_dump has the same major version as the server.
FROM postgres:18-alpine

RUN apk add --no-cache restic supercronic curl openssl

COPY infra/backup/backup.sh /usr/local/bin/backup.sh
COPY infra/backup/restore-dump.sh /usr/local/bin/restore-dump.sh
COPY infra/backup/backup.crontab /etc/backup.crontab
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-dump.sh

CMD ["supercronic", "/etc/backup.crontab"]
