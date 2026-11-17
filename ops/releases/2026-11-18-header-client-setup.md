# Release record: header client-setup link (bozzii.8)

Date: 2026-11-18

## Scope

- Add one header link to the existing `/client-config` page.
- No database schema, quota, channel, or client-link setting changes.

## Production

- Image: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.8`, linux/amd64, image ID `sha256:5ea9aef216068e723f67c8fbee5b1e93de36f628956413a331df6ce4155c4625`.
- Source commit: `5d3755ccd`.
- Pre-cut-over dump: `/opt/xseek-new-api/backups/newapi-pre-bozzii8-20261117T160031Z.dump` (3,259,810 bytes). Config archive and `compose.yaml.pre-bozzii8-20261117T160031Z` are beside it. Not age-encrypted and not restore-tested.
- Cut over with `docker compose up -d --no-deps new-api`. Postgres and Redis stayed up.
- `/api/status` returned `success: true` and version `v1.0.0-rc.48-bozzii.8`. The app container was healthy. No panic line in the first two minutes of logs.
- The header link was not clicked in a browser.

## Rollback

Restore `/opt/xseek-new-api/compose.yaml.pre-bozzii8-20261117T160031Z` and recreate only `new-api` on `v1.0.0-rc.48-bozzii.7`. No database rollback is needed.
