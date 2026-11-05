# Release record: v1.0.0-rc.48-bozzii.3

Date: 2026-11-05. Followed `runbooks/04-release.md`; code change only, upstream base unchanged (`v1.0.0-rc.48`).

## What changed for users

- The mobile drawer wallet link, the wallet button on the balance card, and the "Add credits" step in the
  setup guide now follow the admin Wallet switch (`personal.topup`, set to off on production). Setup progress is
  counted over the remaining steps.
- The top bar's colour-preset drawer is replaced by a light/dark switch. Presets, font, radius and layout can no
  longer be changed by users. The language switcher is unchanged.

## Release data

| Item | Value |
| ---- | ----- |
| Image | `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.3`, linux/amd64 |
| Source commit | `f3ae32bb5` on `brand/bozzii` |
| Delivered to host | `docker save` / `docker load` (not pushed to GHCR) |
| Replaced | `bozzii.2` |

## Sequence

1. Tests: new wallet-visibility tests (4) plus the existing overview and component tests, 107 passing; `tsc -b` clean;
   `oxlint` clean on touched files. The off-case test was checked by reverting the gate and confirming it fails.
2. Backup before staging (`20261105T111143Z`), image loaded on host, staging restored from it on an isolated database
   bound to `127.0.0.1:3100`. Version, counts and channel fingerprint matched production.
3. Backup immediately before cut-over (`20261105T123815Z`), compose rollback copy saved.
4. Changed only the `new-api` image tag; postgres and redis were not restarted.
5. Post-cutover: healthy, version `v1.0.0-rc.48-bozzii.3`, counts identical to the pre-cutover reading.
6. Staging torn down.

## Notes

- Startup log showed client request errors (`field messages is required`) and the known Gemini model with no channel
  (decision D-008). Neither is caused by this release.
- Not verified: how the pages look in a browser for a customer account (no customer login available to the assistant).

## Rollback

Restore the compose copy and recreate only the app container:

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "cd /opt/xseek-new-api && ls compose.yaml.bak-bozzii2-* && cp \$(ls -t compose.yaml.bak-bozzii2-* | head -1) compose.yaml && docker compose up -d --no-deps new-api"
```
