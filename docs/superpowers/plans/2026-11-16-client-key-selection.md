# Client API Key Selection and Coding Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-client API key selection plus Claude Code, Codex and CC Switch configuration without changing existing customer data or the database schema.

**Architecture:** Bind a server-validated token ID into the existing short-lived client-link cache and one-time download flow. Extend the existing client-config page and CC Switch dialog; keep complete keys out of prompts and public guides.

**Tech Stack:** Go/Gin/GORM, React 19/TypeScript, TanStack Query, Vitest/Testing Library, Bun, Docker Compose, termark.

**Spec:** `docs/superpowers/specs/2026-11-16-client-key-selection-design.md`

## Global Constraints

- No database schema, token quota/group/permission, pricing or existing WorkBuddy/DSH format changes.
- Default `token_id=0` preserves current automatic per-client token behavior.
- Anonymous `a-` links remain limited to WorkBuddy and DSH.
- No complete key in prompts, public guides, URLs, logs, localStorage or test output.
- All user-facing frontend strings use `t()` and all seven locale files.
- Reuse project UI components and `CCSwitchDialog`; use Bun for frontend commands.
- Production follows `ops/runbooks/04-release.md`: verified restore and isolated staging are mandatory; never restart PostgreSQL/Redis or run `docker compose down`.
- Follow OWASP ASVS 5.0.0 and the Authentication/Session Management Cheat Sheets for object ownership, TTL, single use, transport and secret handling.

## Review Focus

- A user submits another user's, disabled, expired or deleted token ID: link creation and download must fail uniformly (Task 1 tests).
- A valid key is disabled after link creation but before redemption: redemption must revalidate and fail (Task 1 tests).
- An anonymous share code is manually changed to `claude` or `codex`: exchange must reject it (Task 2 tests).
- The user changes keys after generating a prompt or install command: old output must disappear and new requests must carry the new ID (Task 3 tests).
- A coding guide or CC Switch flow is inspected for secret leakage: public content stays key-free and full keys remain only in authenticated/one-time responses (Tasks 2 and 4 tests).

---

### Task 1: Bind an Existing API Key to Client Links

**Files:**
- Modify: `service/client_link.go`
- Modify: `controller/client_link.go`
- Test: `service/client_link_test.go`
- Test: `controller/client_link_test.go`

**Interfaces:**
- Produces: `NewClientLink(userID int, tokenID int) (string, error)`.
- Produces: `ClientConfigBody(userID int, target string, tokenID int) ([]byte, error)`.
- Produces: POST `/api/client_link` and GET `/api/client_link/download` accept optional `token_id`; zero means automatic.

- [ ] **Step 1: Write failing ownership and lifecycle tests**

Add table cases proving a selected key is used, another user's/zero/unknown/disabled/expired key is rejected, a key disabled after `NewClientLink` is rejected at redemption, and omitted `token_id` still creates the current dedicated WorkBuddy/DSH key.

- [ ] **Step 2: Run the tests and confirm the new cases fail**

Run: `go test ./service ./controller -run 'TestClientLink' -count=1`
Expected: new selected-key cases fail because the functions/request do not accept or propagate token IDs; existing cases still compile after their calls are updated.

- [ ] **Step 3: Implement token validation and propagation**

Add `TokenID` to the cache entry, validate nonzero IDs with `model.GetTokenByIds`, check enabled status and expiry at creation and config generation, propagate the ID through exchange/redeem, and parse direct-download `token_id`. Keep share creation at zero and existing error/timing behavior.

- [ ] **Step 4: Run focused tests and format**

Run: `gofmt -w service/client_link.go service/client_link_test.go controller/client_link.go controller/client_link_test.go && go test ./service ./controller -run 'TestClientLink' -count=1`
Expected: PASS, including replay and pre-existing default flow.

- [ ] **Step 5: Commit**

```bash
git add service/client_link.go service/client_link_test.go controller/client_link.go controller/client_link_test.go
git commit -m "feat(client-link): allow selecting an existing API key"
```

### Task 2: Add Claude Code and Codex Configuration Guides

**Files:**
- Modify: `service/client_link.go`
- Modify: `service/client_link_guide.go`
- Modify: `controller/client_link.go`
- Test: `service/client_link_test.go`
- Test: `controller/client_link_test.go`

**Interfaces:**
- Consumes: Task 1 token-aware `NewClientLink` and `ClientConfigBody`.
- Produces: targets `claude` and `codex`; readiness keys `claude_ready`, `codex_ready`.
- Produces: Claude JSON `api_key/base_url/models/default_model/opus_model/sonnet_model/haiku_model`; Codex JSON `api_key/base_url/models/default_model`.

- [ ] **Step 1: Write failing target, payload and guide tests**

Use a WorkBuddy fixture containing Claude, GPT, GPT-image and other IDs. Assert exact filtered model lists, first-model/default-tier fallback, Claude base URL without `/v1`, Codex base URL with `/v1`, correct filenames, and anonymous `a-` exchange rejection for both new targets. Assert both public guides contain their exchange URL and no `sk-`.

- [ ] **Step 2: Run the new tests and confirm failure**

Run: `go test ./service ./controller -run 'TestClientLink' -count=1`
Expected: `claude` and `codex` are unavailable.

- [ ] **Step 3: Implement coding targets, model filtering and JSON payloads**

Extend the target map/readiness switch, derive models from `clientLinkModelIDs`, and return the spec's JSON fields. Do not add settings or database fields. Restrict anonymous exchange to `workbuddy` and `dsh`.

- [ ] **Step 4: Add safe local setup guides**

Add guide templates for one-time download, CC Switch import, direct Claude settings/Codex TOML merge, byte backup, atomic write, permission checks, cleanup and no model test request. Keep modelPicker out. Validate placeholders remain key-free.

- [ ] **Step 5: Run tests and commit**

Run: `gofmt -w service/client_link.go service/client_link_guide.go service/client_link_test.go controller/client_link.go controller/client_link_test.go && go test ./service ./controller -run 'TestClientLink' -count=1`
Expected: PASS.

```bash
git add service/client_link.go service/client_link_guide.go service/client_link_test.go controller/client_link.go controller/client_link_test.go
git commit -m "feat(client-link): add Claude Code and Codex setup guides"
```

### Task 3: Add the Shared API Key Selector

**Files:**
- Create: `web/src/features/client-config/components/api-key-selector.tsx`
- Modify: `web/src/features/client-config/api.ts`
- Modify: `web/src/features/client-config/index.tsx`
- Modify: `web/src/features/client-config/components/target-panel.tsx`
- Modify: `web/src/features/client-config/components/terminal-install-card.tsx`
- Modify: `web/src/features/client-config/lib/prompt.ts`
- Create: `web/src/features/client-config/__tests__/client-config.test.tsx`
- Modify: `web/src/i18n/locales/{en,zh,zh-TW,fr,ru,ja,vi}.json`

**Interfaces:**
- Produces: `ClientTarget = 'workbuddy' | 'dsh' | 'claude' | 'codex'`.
- Produces: `ApiKeySelector({ value, onValueChange })` with numeric ID, zero for automatic.
- Produces: `createClientLink(target, share, tokenId)` and `saveClientConfig(target, tokenId)`.

- [ ] **Step 1: Read the required UI guidance and inspect candidates**

Read the project `shadcn-ui` skill, `web/src/components/ui/select.tsx`, `web/src/components/ui/combobox.tsx`, existing `CCSwitchDialog`, `TargetPanel`, `CopyButton` and their call sites. Use the existing Select/Combobox and Card patterns; no registry installation.

- [ ] **Step 2: Write failing selector and stale-output tests**

Mock two token pages and verify all pages are loaded, disabled/expired keys are excluded, zero-key default works, token ID is sent, and changing selection clears generated prompt/share/install output. Cover empty list and failed token request without hiding the automatic option.

- [ ] **Step 3: Run the frontend test and confirm failure**

Run: `bun run --cwd web test -- src/features/client-config/__tests__/client-config.test.tsx`
Expected: selector and token-ID behavior are absent.

- [ ] **Step 4: Implement selector and token-aware mutations**

Fetch all token pages through `getApiKeys`, filter enabled/unexpired entries, render name plus masked key, lift `tokenId` into `ClientConfig`, pass it to panels/install mutations, and clear target-local output on change. Keep share token ID at zero.

- [ ] **Step 5: Run tests, typecheck, lint and i18n sync**

Run: `bun run --cwd web i18n:sync && bun run --cwd web test -- src/features/client-config/__tests__/client-config.test.tsx && bun run --cwd web typecheck && bun run --cwd web lint -- src/features/client-config src/i18n`
Expected: PASS with no new lint errors; inspect sync output before continuing.

- [ ] **Step 6: Commit**

```bash
git add web/src/features/client-config web/src/i18n/locales
git commit -m "feat(client-config): add shared API key selector"
```

### Task 4: Add Coding Tabs and Reuse CC Switch Import

**Files:**
- Modify: `web/src/features/client-config/index.tsx`
- Modify: `web/src/features/client-config/lib/prompt.ts`
- Create: `web/src/features/client-config/components/cc-switch-card.tsx`
- Modify: `web/src/features/keys/components/dialogs/cc-switch-dialog.tsx`
- Modify: `web/src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx`
- Test: `web/src/features/client-config/__tests__/client-config.test.tsx`

**Interfaces:**
- Consumes: Task 3 `tokenId` and authenticated config download.
- Produces: optional `CCSwitchDialog.initialApp?: 'claude' | 'codex' | 'gemini'`, default `claude`.

- [ ] **Step 1: Write failing coding-tab and initial-app tests**

Verify Claude/Codex tabs follow readiness, prompt generation carries the selected key, CC Switch opens with the matching app and downloaded key, and no key appears in the prompt DOM. Extend the existing dialog test for `initialApp='codex'` and unchanged default behavior.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun run --cwd web test -- src/features/client-config/__tests__/client-config.test.tsx src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx`
Expected: coding targets and initial-app behavior are absent.

- [ ] **Step 3: Implement coding tabs and CC Switch card**

Add target labels/readiness, a coding-only CC Switch card that obtains the selected config through the authenticated endpoint, stores its key only in memory, and opens `CCSwitchDialog` with `initialApp`. Do not render anonymous sharing or WorkBuddy terminal install for coding targets.

- [ ] **Step 4: Run focused tests and static checks**

Run: `bun run --cwd web test -- src/features/client-config/__tests__/client-config.test.tsx src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx && bun run --cwd web typecheck && bun run --cwd web lint -- src/features/client-config src/features/keys/components/dialogs/cc-switch-dialog.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/client-config web/src/features/keys/components/dialogs/cc-switch-dialog.tsx web/src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx web/src/i18n/locales
git commit -m "feat(client-config): add coding clients and CC Switch import"
```

### Task 5: Full Local Verification and Browser Acceptance

**Files:**
- Modify only files needed to fix discovered defects.
- Create: `ops/releases/2026-11-16-client-config-keys.md` for actual verification/release evidence.

- [ ] **Step 1: Run backend and frontend regression suites**

Run: `go test ./...`
Run: `bun run --cwd web test -- src/features/client-config src/features/keys/components/dialogs/__tests__/cc-switch-dialog.test.tsx`
Expected: PASS; no skipped new test is counted as success.

- [ ] **Step 2: Run formatting, typecheck, lint and production builds**

Run: `bun run --cwd web format:check`
Run: `bun run --cwd web lint`
Run: `bun run --cwd web build:check`
Run: `go build ./...`
Expected: all exit 0. Fix only relevant failures and rerun affected checks.

- [ ] **Step 3: Start the local app and exercise the golden and edge paths**

Use a throwaway database and test account with two keys. In the browser verify default/selected key prompt generation, key switching, all four tabs, masked lists, CC Switch Claude/Codex initial app, download responses, anonymous share restrictions, and console/network secret leakage. Do not write real user client config or send paid model requests.

- [ ] **Step 4: Record evidence and commit**

Record commands, counts, browser results and any unverified limits in `ops/releases/2026-11-16-client-config-keys.md`; do not claim live client conversation success without a real request.

```bash
git add ops/releases/2026-11-16-client-config-keys.md
git commit -m "test(client-config): record multi-key acceptance results"
```

### Task 6: Independent Review and Release Approval Evidence

**Files:**
- Modify only defects found by review.

- [ ] **Step 1: Invoke `superpowers:requesting-code-review`**

Request a fresh review of the complete diff against the spec, emphasizing object ownership, anonymous targets, token lifecycle, secret handling and stale UI output.

- [ ] **Step 2: Verify and fix actionable findings**

Use `superpowers:receiving-code-review`; reproduce each valid finding with a focused test, fix the root cause, and rerun Task 5 checks affected by the change.

- [ ] **Step 3: Commit review fixes if any**

```bash
git add <verified changed files>
git commit -m "fix(client-link): address configuration review findings"
```

### Task 7: Build, Stage and Deploy `bozzii.7`

**Files:**
- Modify: `ops/releases/2026-11-16-client-config-keys.md`
- Modify: `ops/CONTROL.md` current release state only after deployment.

- [ ] **Step 1: Push the exact reviewed source and build the image**

Run: `git push -u origin brand/bozzii-deploy`
Run: `sh ops/build-image.sh v1.0.0-rc.48 7`
Expected: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.7`, `linux/amd64`, image label revision equals reviewed HEAD.

- [ ] **Step 2: Back up and prove restore**

Use termark on origin asset `a1b646cd-1a82-492d-9621-a88c8ed5f905`; follow `ops/runbooks/02-backup.md` and `03-restore.md`. Restore the newest dump into a separate staging database and compare user/channel/token counts and quota sum. Never print secrets or `channels.key`.

- [ ] **Step 3: Run isolated staging**

Load the image on the host, start a separate compose project bound to `127.0.0.1`, and verify status, login, existing client-config defaults, two-key selection, new coding guides, data counts and logs. Keep production containers and data untouched.

- [ ] **Step 4: Cut over only the application**

Take a final backup, save `compose.yaml` rollback copy, set only the `new-api` image to `bozzii.7`, then run `docker compose up -d --no-deps new-api`. Do not stop PostgreSQL/Redis. On failure restore the old `bozzii.6` tag and recreate only the app.

- [ ] **Step 5: Verify production**

Check `/api/status`, container health/logs, data counts, existing WorkBuddy/DSH generation, selected-key ownership failures, both new public guides without keys, and the browser four-tab flow. Use a dedicated test key/account; do not expose or print real customer keys.

- [ ] **Step 6: Record the release and commit**

Record image ID/digest, backup/staging evidence, production checks, rollback location and limits in the release note and `ops/CONTROL.md`; commit and push the exact deployed documentation.

### Task 8: Merge and Clean Up

- [ ] **Step 1: Create and review the PR**

Create a PR from `brand/bozzii-deploy` to `main` with the actual verification commands/results and AI-assisted disclosure required by `AGENTS.md`. Bind it with `ccd_pr`, inspect CI/review state, and address failures before merging.

- [ ] **Step 2: Merge once checks and production verification pass**

Run: `gh pr merge --merge <pr-url>`
Expected: PR merged into `main`; no force push, no auto-merge setting.

- [ ] **Step 3: Clean temporary resources**

Remove only this task's staging compose project/database, throwaway local databases/configs and merged remote feature branch. Preserve production backups, rollback compose and old `bozzii.6` image for at least 24 hours. Use native worktree cleanup where available; verify `git status` and remaining worktrees before finishing.
