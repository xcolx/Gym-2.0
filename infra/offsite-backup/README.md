# Offsite backup server

Stores the encrypted [restic](https://restic.net) backups of the production host (see [Backups](../README.md#backups)
in the infrastructure README) on a separate machine. The container runs [rest-server](https://github.com/restic/rest-server)
twice, on the same data directory:

| Port | Mode | Used by |
|---|---|---|
| 8000 | append-only: snapshots can be added and read, not deleted or changed | the production host, every night |
| 8001 | full access: also removes old snapshots (`restic forget --prune`) | an admin machine, about once a month |

The production host only knows the append-only login, so even a compromised production host can't delete its backups.
The full-access endpoint can delete everything, so this server must only let the admin machine reach it (see
[Securing the full-access endpoint](#securing-the-full-access-endpoint)).
The data is encrypted by restic before it is sent: this server never sees the repository password and can't read the
backups.

## Requirements

- Docker
- A reverse proxy with TLS in front of the container (the examples use Traefik with Let's Encrypt), and two DNS names,
  e.g. `backup.example.org` (append-only) and `backup-admin.example.org` (full access)
- Disk space for the backups, ideally on its own disk or dataset

## Setup

1. Create `.env` from [.env.example](.env.example) and fill in the passwords (`openssl rand -hex 32`).
2. Build and run the container. Only the reverse proxy needs to reach it, so don't publish the ports on the host:
   ```bash
   docker build -t offsite-backup .
   docker run -d --name offsite-backup --restart unless-stopped --env-file .env \
     -v /srv/offsite-backup:/data --network <network of the reverse proxy> offsite-backup
   ```
   The repositories are stored in `/srv/offsite-backup/<REPO_USER>/` on the host.
3. Route both DNS names to the container through the reverse proxy, and restrict the full-access one as described in
   [Securing the full-access endpoint](#securing-the-full-access-endpoint).
4. Pass these to the operator of the backed up host:
   - append-only: `rest:https://backup.example.org/<REPO_USER>/`, user `REPO_USER`, password `APPEND_ONLY_PASSWORD`
   - full access: `rest:https://backup-admin.example.org/<REPO_USER>/`, user `REPO_USER`, password `FULL_ACCESS_PASSWORD`

   The backed up host creates the repository itself (`restic init` through the append-only endpoint).

## Securing the full-access endpoint

Securing the endpoints is the job of this server's setup, the backed up host has no say in it. The append-only
endpoint has to be reachable by the backed up host and can be public: its login can't delete anything. The full-access
endpoint, however, can delete every backup with just its password, so never expose it to the whole internet. Either:

- only route it for the admin machine's address, e.g. with Traefik's
  [ipAllowList](https://doc.traefik.io/traefik/middlewares/http/ipallowlist/) middleware on the
  `backup-admin.example.org` router (needs a fixed address of the admin machine, and the DNS name set to DNS only, see
  below, so the proxy sees the real address), or
- only make it reachable through a VPN (WireGuard, Tailscale) that the admin machine is part of, and don't route it
  through the public reverse proxy at all.

Check it from a machine that isn't allowed: `curl -I https://backup-admin.example.org/` must not reach rest-server
(no `401 Unauthorized`).

## Notes

- **Timeouts:** restic uploads files of up to a few dozen MB. Traefik v3 closes requests after 60 s by default
  (`entryPoints.<name>.transport.respondingTimeouts.readTimeout`), which a slow upload can exceed. Raise it for the
  entrypoint used here, e.g. to `600s`, or `0` for no limit.
- **No CDN proxy:** if the DNS names are on Cloudflare, set them to DNS only. Proxied requests are limited in size and
  time, and the backups don't need it.
- **Disk:** a quota on the data directory (e.g. a ZFS dataset with `quota`, or its own partition) keeps the backups
  from filling the disk. rest-server's own `--max-size` isn't used: each of the two instances counts the size itself,
  so the append-only one would never see the space freed by a prune and reject every backup once its count reached the
  limit. Filesystem snapshots (ZFS, btrfs) of the data directory add another layer of protection.
- **Changing a password:** update `.env` and recreate the container. The htpasswd files are written on every start.
- **Monitoring** is done on the backed up host, which reports every nightly run to an external check.
