# 01 — Access to the production server

## Where things are

- Production host: `154.19.43.98` (Hong Kong). Labelled "VPS A3" in Termark.
- Termark asset ID: `1cc3ef79-f6fe-4aac-913b-34f703da1d8e`
- Application directory on the host: `/opt/xseek-new-api`

The asset ID is not a secret. Credentials for the host are held by Termark
on the operator's Mac; no password or key is needed in any command below.

## Preconditions

- The Termark desktop app is running on the operator's Mac.
- `termark` CLI is on `PATH`.

## Commands

Look up the asset (if the ID above has changed):

```bash
termark assets list -q "A3" --json
```

Run a single command on the host:

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "docker ps --format '{{.Names}} {{.Image}} {{.Status}}'"
```

Run a multi-line or quote-heavy command by piping it on stdin, so nothing
sensitive ends up in the process list:

```bash
cat <<'EOF' | termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e --stdin
set -eu
cd /opt/xseek-new-api
docker compose ps
EOF
```

Copy a file to the host (for example a script in `ops/`):

```bash
termark upload 1cc3ef79-f6fe-4aac-913b-34f703da1d8e ops/backup-offsite.sh /opt/xseek-new-api/ops/backup-offsite.sh
```

Copy a file from the host:

```bash
termark download 1cc3ef79-f6fe-4aac-913b-34f703da1d8e /tmp/some-file ./some-file
```

## Verify the connection

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "hostname; docker ps -q | wc -l"
```

Expect the hostname of the production host and a non-zero container count.

## Rules for this host

- Do not run `docker compose down`, `docker volume rm`, `rm -rf` on
  `/opt/xseek-new-api`, or anything under `postgres/` or `redis/`.
- Do not run commands that restart `xseek-new-api` unless the operator asked for
  that restart in this session (see `runbooks/04-release.md`).
- Do not paste the output of `cat .env`, `docker inspect` of the app container,
  or `crontab -l` into a chat. These show secrets or internal paths.
- Other containers on this host belong to other projects (`jumpcli`, `meteroid`,
  `skillhub`, `tulite`, `partspo`, `temu-app`, `nezha`, `uptime-kuma`, 1Panel).
  Do not stop, restart, or change them.
