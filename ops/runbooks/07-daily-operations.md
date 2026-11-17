# 07 — Daily, weekly and monthly operations

Routine checks for the production deployment. Each check has the command, the expected
result, and what to do when it fails. Run from the operator's Mac with Termark.

Host asset: `a1b646cd-1a82-492d-9621-a88c8ed5f905`

## Daily (automated, check the result)

**Offsite backup ran.** Cron runs at 03:47 server time.

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "tail -2 /var/log/xseek-offsite-backup.log"
```

Expect: `Offsite backup uploaded: <stamp>`.
If not: read the lines above it. `NotImplemented 501` lines are harmless (O-8). Anything
else: stop, follow `06-known-issues.md`, do not change retention settings.

**Application healthy.**

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "cd /opt/xseek-new-api && docker compose ps --format '{{.Name}} {{.Status}}'"
```

Expect: all three containers `Up … (healthy)`.

**Counts have not dropped.** Users, channels and tokens only grow in normal operation.

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "cd /opt/xseek-new-api && docker compose exec -T postgres psql -U newapi -d newapi -tAc \"SELECT (SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM channels),(SELECT COUNT(*) FROM tokens),(SELECT SUM(quota) FROM users);\""
```

Compare with the last recorded values in `CONTROL.md` §2. A fall in any count is a stop
condition: do not restart anything; investigate first.

## Weekly

**Disk and build cache.**

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "df -h / | tail -1; docker system df"
```

Act: host disk above 80% → investigate. Build cache above 10 GB on the Mac →
`docker builder prune --keep-storage 10GB`.

**Offsite objects match the schedule.** Expect one dump and one config per day, going back
at most 30 days.

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "rclone lsl r2:bozzii/newapi/ | sort -k2,3 | tail -4; rclone size r2:bozzii/newapi/"
```

**Table growth.** The `logs` table grows about 30 MB per month.

```bash
termark exec a1b646cd-1a82-492d-9621-a88c8ed5f905 "cd /opt/xseek-new-api && docker compose exec -T postgres psql -U newapi -d newapi -tAc \"SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 3;\""
```

## Monthly

**Restore drill.** Pick the most recent offsite object, download, decrypt on the Mac and
compare checksums, then restore into a scratch database on the host. Follow
`03-restore.md` §1 and §2 exactly. Record the result in `CONTROL.md` §2 (Backups).

**Open items review.** Read `CONTROL.md` §5. Any item whose trigger has happened gets
actioned or re-dated.

**Key review.** Confirm the age private key is still in the password manager, and that
the R2 token scope is still bucket-only (O-1).

**Upstream check.** Compare the latest upstream release tag with the one we run. Read its
release notes for security fixes. A security fix is applied within two weeks; other
releases on the next planned window. Create a `sync/upstream-<tag>` branch and follow
`FORK.md` and `04-release.md`.

## Never during business hours

- Restarting `xseek-new-api`
- Changing `BIND_ADDRESS`, `SESSION_COOKIE_SECURE`, or any secret
- Changing channels or balances by hand in the database

Use the admin interface for channel and balance changes, so the cache stays consistent.
