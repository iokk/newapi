# Release record: client multi-key and coding setup (bozzii.7)

Date: 2026-11-16

## Scope

- Optional existing API key selection for WorkBuddy, DeepSeek Harness, Claude Code and Codex configuration.
- Existing default remains automatic per-client token creation; anonymous sharing remains limited to WorkBuddy/DSH.
- Key ID is bound into the existing short-lived link and one-time device-bound download flow. No complete key is added to prompts or public guides.
- Claude Code/Codex configuration JSON and safe local setup guides; CC Switch uses the existing dialog.
- No database schema, quota, group, pricing or existing WorkBuddy/DSH payload changes.

## Local verification

| Check | Command / method | Result |
| --- | --- | --- |
| Backend suite | `go test ./...` | exit 0 |
| Go build | `go build ./...` | exit 0 |
| Frontend client tests | `bun run --cwd web test -- src/features/client-config src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx` | 3 files, 16 tests passed |
| TypeScript | `bunx -p typescript tsc -b web/tsconfig.json` | exit 0 |
| Focused lint | `bun run --cwd web oxlint -c .oxlintrc.json src/features/client-config` | exit 0 |
| Frontend production build | `bun run --cwd web build` | exit 0 |

The local Bun is 1.3.11 and does not provide the repository's `bun check -b`, so TypeScript was checked with `tsc -b` instead of upgrading the operator's runtime.

Full-repository lint still exits 1 on pre-existing files; no reported error path is in this change. Full format check reports 24 pre-existing files. Their formatter-only edits were reverted and are not part of this release. `web/src/features/client-config/landing.tsx` was already in that format-failure list and was not changed by this feature.

## Isolated browser acceptance

Environment: a separate local SQLite file and port 3210, two test keys (`laptop`, `office`), no production data and no paid model request. The temporary app was stopped after verification.

- Four tabs rendered; the key list contained only masked keys.
- `laptop` WorkBuddy prompt redeemed once with the selected key; replay returned 404.
- Authenticated DSH, Claude and Codex downloads all used the selected key.
- Claude models: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; default `claude-opus-5-5`; base URL had no `/v1`.
- Codex models contained `gpt-6.1-sol` only; `gpt-image-1` and `other-model` were excluded; base URL ended `/v1`.
- Anonymous share exchange for Claude returned 404; the existing WorkBuddy share flow returned 200.
- Public Claude/Codex guides did not contain a key.
- CC Switch opened with Claude selected on the Claude tab and Codex selected on the Codex tab; no full key appeared in the DOM. The local CC Switch protocol was not launched.
- Switching from `laptop` to `office` cleared the previously generated prompt (`promptCount=0`).
- At 375px, the initial four-tab layout put Codex outside the viewport. A regression test was added and the list now wraps: all four tabs have a right boundary within 375px.

No real `~/.claude`, `~/.codex`, `~/.dsh` or `~/.workbuddy` file was read or written. No live client conversation was claimed or tested.

## Independent review

A fresh Fable reviewer inspected `6a692918b..9084dd0be` and returned **Ready to merge: Yes**, with no Critical or Important findings. Three Minor items were deferred: a narrow admin-template race, duplicated blob parsing and repeated template parsing.

## Backup and restore proof

- Image: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.7`, linux/amd64, image ID `sha256:7bcebbad2ad3fdfe93ab6b0d907f310a1674a9b84402ff5f95a7e8b7aa7ff150`.
- Source revision embedded in the image: `9084dd0be95a4a13c1b3807c27ed12958772f0ec`, identical to the reviewed commit.
- Pre-staging dump: `newapi-pre-bozzii7-20261116T073900Z.dump`; final cut-over dump: `newapi-pre-bozzii7-cutover-20261116T080725Z.dump`. Matching config archives were created with mode 600.
- The origin no longer has `backup.sh`, rclone or the old cron setup, so dumps were produced directly with `pg_dump -Fc` and `tar`. No backup infrastructure was installed or changed.
- Both backup generations were downloaded and age-encrypted on the operator Mac under `~/.config/bozzii-backup/releases/2026-11-16-bozzii7/`. Temporary plaintext was deleted. R2 was not available on this origin.
- The first encrypted dump decrypted byte-for-byte to the source; host and Mac SHA-256 were both `824379128331d7c665378b9bc5134dcc7b90d057d8db8158bde8ede8eae1467c`.
- Scratch restore: 14 users / 23 channels / 33 token rows, matching the then-current production counts. Quota sum differed normally because live usage continued after the backup. The scratch database was dropped.

## Staging

- A separate compose project restored the backup into isolated PostgreSQL/Redis volumes, with staging-only credentials and listeners only on `127.0.0.1:3211` and `127.0.0.1:3212`. Production services and volumes were not connected.
- Loaded image architecture and source revision matched the local build. `/api/status` returned `v1.0.0-rc.48-bozzii.7`.
- A dedicated staging user and two test keys were created. WorkBuddy, DSH, Claude and Codex all used the selected key; all four readiness flags were true; public coding guides had no key; a foreign token ID was rejected; no panic lines appeared.
- After the two test keys, staging counts were 15 users / 23 channels / 35 token rows. The entire staging compose project, volumes and temporary directory were removed after production verification.

## Production

- Cut over only `new-api` with `docker compose up -d --no-deps new-api`; PostgreSQL and Redis stayed running throughout.
- Public `/api/status`: `success: true`, version `v1.0.0-rc.48-bozzii.7`, system name `Bozzii AI`; all three containers healthy; zero panic lines in the post-release log window.
- Production browser showed all four tabs and the masked test-key selector.
- Dedicated `bozzii7-laptop` / `bozzii7-office` keys were used only for verification. WorkBuddy, DSH, Claude and Codex one-time downloads all matched the selected laptop key; replay returned 404; coding guides contained no key.
- The test keys were deleted through the canonical API path. They remain only as soft-deleted audit rows (IDs 34–37); there are no active test keys. Active token count was unchanged; raw token rows include these four expected test records.
- No live Claude Code/Codex conversation or local CC Switch protocol launch was performed.

## Rollback

Rollback compose: `/opt/xseek-new-api/compose.yaml.pre-bozzii7-20261116T080725Z`. Restore it and recreate only the app with `v1.0.0-rc.48-bozzii.6`; PostgreSQL and Redis stay running. The `bozzii.6` image is retained for at least 24 hours. No database rollback is needed because there was no schema migration; do not hard-delete the four soft-deleted test-token audit rows.
