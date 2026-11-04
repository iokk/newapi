# 03 — Restore and proof of restore

A backup that has never been restored is not a backup. Run §2 after every
change to the backup chain, and at least once a month.

## 1. Restore to a scratch database (on host, does not touch production)

Replace `<stamp>` with a real stamp such as `20261104T203451Z`.

```bash
cd /opt/xseek-new-api
docker compose exec -T postgres createdb -U newapi restore_check
docker compose exec -T postgres pg_restore -U newapi -d restore_check --no-owner < backups/newapi-<stamp>.dump
```

Compare counts with production:

```bash
docker compose exec -T postgres psql -U newapi -d restore_check -tAc \
  "SELECT (SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM channels),(SELECT COUNT(*) FROM tokens),(SELECT SUM(quota) FROM users);"
docker compose exec -T postgres psql -U newapi -d newapi -tAc \
  "SELECT (SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM channels),(SELECT COUNT(*) FROM tokens),(SELECT SUM(quota) FROM users);"
```

Clean up:

```bash
docker compose exec -T postgres dropdb -U newapi restore_check
```

Counts can differ by new rows if production has changed since the backup. A
difference of more than a few rows, or any missing table, is a failure.

The last verified result (2026-11-04): users 12, channels 21, tokens 18,
quota sum 1755822390, identical on both sides.

## 2. Verify the offsite copy end to end

This is the full proof: encrypted object in R2, downloaded, decrypted on the
operator's Mac, compared with the source.

On the host, stage the newest two objects:

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "mkdir -p /tmp/verify && rclone copy r2:bozzii/newapi/newapi-<stamp>.dump.age /tmp/verify/ && rclone copy r2:bozzii/newapi/config-<stamp>.tar.gz.age /tmp/verify/ && sha256sum /opt/xseek-new-api/backups/newapi-<stamp>.dump"
```

Download to the Mac:

```bash
termark download 1cc3ef79-f6fe-4aac-913b-34f703da1d8e /tmp/verify /tmp/bozzii-verify
```

Decrypt and compare, on the Mac:

```bash
cd /tmp/bozzii-verify
age -d -i ~/.config/bozzii-backup/age-key.txt -o dump.restored newapi-<stamp>.dump.age
shasum -a 256 dump.restored
```

The checksum must match the host's `sha256sum` of the source file, byte for byte.

Clean up both sides immediately, because the config archive contains a decrypted `.env`:

```bash
rm -rf /tmp/bozzii-verify
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "rm -rf /tmp/verify"
```

## 3. Restore into a new instance (disaster recovery or staging)

Use only when production is lost or when building staging for a release.

1. On a new host or in a separate compose project, put `compose.yaml` and `.env` from
   the config archive into a fresh directory. Do not reuse production volume paths.
2. Start only postgres and redis with the same versions as production
   (`postgres:15-alpine`, `redis:8-alpine`).
3. Restore the dump into an empty database named `newapi`, as in §1 but without
   `createdb` if it already exists.
4. Start the application with the image under test (see `04-release.md`).
5. Check login, channel test, and one API call before pointing any domain at it.

## Stop conditions

- `pg_restore` prints errors that are not warnings about existing objects.
- Checksums differ.
- The decrypted config archive does not list `compose.yaml`, `.env`, and `data/`.
- Any step asks for a password. Stop and ask the operator; do not look for one.
