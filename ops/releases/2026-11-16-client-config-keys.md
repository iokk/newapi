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

## Staging

Pending.

## Production

Pending.

## Rollback

Pending. The intended rollback is to restore the pre-release compose copy and recreate only the app with `v1.0.0-rc.48-bozzii.6`; PostgreSQL and Redis stay running. No database rollback is expected because this change has no schema migration.
