# Offsite backup server: a restic rest-server with two endpoints on the same repositories, see README.md.
#   :8000  append-only   for the backed up host, can add snapshots but not delete or change them
#   :8001  full access   for the admin machine, removes old snapshots (restic forget --prune)
FROM restic/rest-server:0.14.0

COPY entrypoint.sh /usr/local/bin/backup-server-entrypoint.sh
RUN chmod +x /usr/local/bin/backup-server-entrypoint.sh

EXPOSE 8000 8001
VOLUME /data

ENTRYPOINT ["/usr/local/bin/backup-server-entrypoint.sh"]
