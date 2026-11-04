# 02 — Backup and offsite copy

## 1. What is backed up

| Item | Source on host | In the backup | Why |
| ---- | -------------- | ------------- | --- |
| Database | container `xseek-new-api-postgres`, db `newapi` | `newapi-<stamp>.dump` | Users, balances, channels (with upstream keys), tokens, orders, options, usage logs |
| Config | `compose.yaml`, `.env`, `data/` | `config-<stamp>.tar.gz` | Needed to rebuild the stack; `.env` holds secrets |

Not backed up, on purpose:

- `postgres/` raw files: the `.dump` is the portable copy and restores more reliably.
- `redis/`: cache and session state. Losing it forces users to log in again; it
  is not business data.
- `logs/`: application log files. Useful for debugging only.

Size today: database dump about 1.6 MB; the `logs` table is the largest table
(about 30 MB raw, about 18,700 rows covering roughly one month) and grows over time.

## 2. Local backup (on host)

`/opt/xseek-new-api/backup.sh` (the original script, unchanged):

- writes `backups/newapi-<UTC stamp>.dump` with `pg_dump -Fc`
- writes `backups/config-<UTC stamp>.tar.gz`
- files are mode 600, owned by root

Run it by hand:

```bash
cd /opt/xseek-new-api && sh backup.sh
```

## 3. Offsite backup (what cron runs)

`/opt/xseek-new-api/ops/backup-offsite.sh`:

1. runs `backup.sh`
2. encrypts the newest dump and config archive with `age` to the public key in
   `ops/age-recipient.txt`
3. uploads only the `.age` files to `r2:bozzii/newapi/` using rclone
4. deletes local plaintext copies older than 7 days
5. deletes remote `*.age` objects older than 30 days (`RETAIN_DAYS`), guarded so it
   only runs for `r2:bozzii/newapi` or a local path

The plaintext dump stays on the host for 7 days because restores are faster from
local disk. The uploaded copy is the long-term archive.

## 4. Schedule

Installed in the root crontab on the host:

```
47 3 * * * PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/sh /opt/xseek-new-api/ops/backup-offsite.sh >> /var/log/xseek-offsite-backup.log 2>&1
```

The previous crontab is saved at `/root/crontab.before-xseek-offsite` on the host.
Other existing cron jobs (`jumpcli` at 03:20, `x-ui` restart at 02:00 and per minute)
belong to other projects and must be left as they are.

Check the last run:

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "tail -5 /var/log/xseek-offsite-backup.log"
```

Expect the line `Offsite backup uploaded: <stamp>`.

## 5. Verify an upload (do this after changing anything in the chain)

List what is in R2 (names and sizes only):

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "rclone lsl r2:bozzii/newapi/"
```

Then run the full check in `03-restore.md` §3. A backup is not considered good
until one object has been downloaded, decrypted, and compared with its source.

## 6. Keys and secrets (required reading)

| Secret | Where it lives | Notes |
| ------ | -------------- | ----- |
| age **private** key | operator's Mac: `~/.config/bozzii-backup/age-key.txt` (mode 600) | Must also be in the operator's password manager. Losing it makes every backup unreadable. |
| age public key | host: `ops/age-recipient.txt` | Not secret |
| R2 S3 access key and secret | host: `/root/.config/rclone/rclone.conf` (mode 600) | Written by `setup-r2.sh` or by stdin |
| Cloudflare account API token (`cfat_…`) | not stored anywhere on the host | Not needed by any script |

**Status of the R2 keys (as of this runbook):** the access key and secret were
pasted into a chat transcript during testing, and the account token that
generated them covers all buckets. These are open items:

1. In Cloudflare, delete the all-buckets account token.
2. Create a new R2 token scoped to bucket `bozzii` only, with object read and write.
3. On the host, replace the keys in `rclone.conf` without printing them:
   use `setup-r2.sh` at an interactive SSH session, or write the file from stdin.
4. Run `rclone lsl r2:bozzii/newapi/` to confirm access still works.
5. Record the rotation date in this file.

Until step 5 is done, treat the old keys as compromised.

## 7. Known issues

- rclone 1.60 on the host returns `501 NotImplemented` on the first upload attempt
  to R2 and succeeds on retry. Harmless. Upgrading rclone should remove it.
- Retention runs after upload. If the upload fails, the script stops before deleting
  anything (`set -eu`).
