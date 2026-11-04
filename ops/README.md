# ops/ — Bozzii new-api operations

This directory is the operations handbook for the production deployment of
`ai.bozzii.com` (a fork of QuantumNous/new-api). It is written so that a human
or an AI agent (Claude Code, Hermes, or similar) can pick it up cold and
repeat the work safely.

**Read this file first, then the runbook for your task.** Each runbook lists
preconditions, exact commands, how to verify, and when to stop.

## Golden rules

1. **Never print, paste, or commit secrets.** Keys live in the places listed in
   `runbooks/05-server-inventory.md`. Refer to them by path or name only.
2. **Never change the live database without a fresh, verified backup** (see
   `runbooks/02-backup.md`).
3. **Never swap the production image without a restore test and a staging run**
   (see `runbooks/04-release.md`).
4. **Keep the old container and old image tag** until the new one has run cleanly
   for at least 24 hours. Rollback must be a single command.
5. **Do not edit upstream files** except the one-line hooks listed in
   `FORK.md` (currently `web/src/styles/index.css`). Everything else goes in new
   files so `git merge upstream/main` stays conflict-free.
6. **Customer-facing changes** (payments, balances, channels) are done by the
   human operator, or by an agent only after the operator says yes in that
   session.

## Runbooks

| File | Use it for |
| ---- | ---------- |
| `runbooks/01-access.md` | How to reach the production server from the operator's Mac |
| `runbooks/02-backup.md` | Nightly backup, encryption, offsite upload to Cloudflare R2, retention |
| `runbooks/03-restore.md` | Restoring from a backup, and how to prove a backup is usable |
| `runbooks/04-release.md` | Building our image, staging it, cutting over, rolling back |
| `runbooks/05-server-inventory.md` | Server layout, containers, cron jobs, file paths, where secrets live |
| `runbooks/06-known-issues.md` | Problems that happened during release and how to prevent them |

## Scripts

| File | Runs where | What it does |
| ---- | ---------- | ------------ |
| `backup-offsite.sh` | Production server, from cron | Calls the app's `backup.sh`, encrypts the newest dump and config archive with age, uploads ciphertext to R2, prunes R2 objects older than `RETAIN_DAYS` (default 30) |
| `setup-r2.sh` | Production server, once | Writes the rclone remote config from keys typed at a hidden prompt |
| `age-recipient.txt` | Production server | The age **public** key that encrypts backups. Safe to share. |

The **private** age key exists only on the operator's Mac, under
`~/.config/bozzii-backup/age-key.txt` (mode 600). Without it, no backup can be
decrypted. It must also be kept in the operator's password manager.

## Current status

| Item | State |
| ---- | ----- |
| Production version | `calciumion/new-api:v1.0.0-rc.44` (upstream latest is rc.48) |
| Production database | PostgreSQL 15 in container `xseek-new-api-postgres`, bind mount `/opt/xseek-new-api/postgres` |
| Nightly offsite backup | Installed in cron at 03:47 server time; first run verified |
| Offsite storage | Cloudflare R2 bucket `bozzii`, prefix `newapi/`, public access disabled |
| Restore test | Passed on a scratch database (12 users, 21 channels, 18 tokens, matching checksums) |
| Brand build | Branch `brand/bozzii` in `iokk/newapi`: CSS tokens and bilingual landing page |
| Image registry | **Decided:** GHCR, `ghcr.io/iokk/bozzii-new-api`, public. Tags `<upstream>-bozzii.<n>`, never `latest` |
| Local image | Built: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.1` from commit `50abf2f08`. Verified: version string in binary, landing page and brand CSS embedded, `/api/status` healthy on an empty SQLite database. **Not pushed.** Build with `ops/build-image.sh` |
| Production image | **Replaced 2026-11-05.** Now `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.2` (digest `sha256:f1e7af2c…`). Previous `calciumion/new-api:v1.0.0-rc.44` kept in `compose.yaml.bak-rc44-*` for rollback |
| Open: R2 keys | Keys were pasted into a chat transcript during testing. **Must be rotated.** See `runbooks/02-backup.md` §6 |
| Open: R2 token scope | The token used for testing covers all buckets on the account. Replace it with a bucket-scoped token |

## For agents: how to use this directory

- Start with the runbook that matches the request. Do not improvise steps that
  are not written down; if a step is missing, stop and ask the operator.
- Run read-only checks first, and show the operator their output before any write.
- Treat any command that touches `postgres`, `backups/`, `/opt/xseek-new-api/`,
  or the cron table as a write, even if it looks harmless.
- If a verification fails, stop. Do not retry a failing restore or upload in a
  loop, and do not delete files to make a check pass.
