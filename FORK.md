# Fork workflow for ai.bozzii.com

This repository is a fork of [QuantumNous/new-api](https://github.com/QuantumNous/new-api)
(AGPL-3.0) carrying Bozzii branding. The goal is to keep merging upstream
releases with as close to zero conflict as possible.

## Remotes

| Remote     | URL                                          | Purpose                   |
| ---------- | -------------------------------------------- | ------------------------- |
| `upstream` | https://github.com/QuantumNous/new-api.git   | Official source. Read-only. |
| `origin`   | https://github.com/iokk/newapi.git           | Our fork. Push here.       |

`upstream` is the clone's original remote after the rename, so it keeps the
`--filter=blob:none` partial-clone setting. Blobs are fetched on demand; the
first checkout after a fetch downloads only what changed.

## Branch and release workflow

`origin/main` is the only long-lived integration branch and the source for every
production image. The retired `brand/bozzii` branch must not be recreated.
`upstream` is read-only: never push to it.

```text
QuantumNous/new-api (upstream, read-only)
        | fetch + merge a release tag through a sync/* PR
        v
iokk/newapi main  <--- feat/*, fix/*, docs/* short-lived branches via PR
        |
        | explicit build, staging and cut-over (not triggered by a merge)
        v
ai.bozzii.com production
```

For a feature, fix, or documentation change:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-name       # or fix/short-name, docs/short-name
# Make the change and run the pre-PR gate before pushing:
./ops/pre-pr-check.sh
git push -u origin feat/short-name
gh pr create --repo iokk/newapi --base main --head feat/short-name
```

Review the diff and wait for the PR's CI checks. Merge only the intended change;
a PR into `main` does not change production. After merging, pull `main`, delete
the feature branch, and deploy only through `ops/runbooks/04-release.md`.
Production-only changes must be merged into `main` as well, so deployed source
is never stranded on a temporary branch.

Use one worktree per active change. Do not keep permanent `brand/*`, `deploy/*`,
or session-specific `claude/*` integration branches. Never delete an unmerged
branch, a branch checked out in another worktree, or a Dependabot branch with an
open PR without checking it first. `git branch --merged origin/main` identifies
candidates, not an automatic deletion list.

## Updating from upstream

Check upstream monthly and promptly for security fixes. Follow
`ops/runbooks/04-release.md`: merge an upstream **release tag** into a
`sync/upstream-<tag>` branch, not directly into `main`. Review the complete diff,
including database migrations, preserve `CUSTOM(brand)` hooks, test, and open a
PR into `main`. Do not routinely merge `upstream/main`, which runs ahead of its
releases. If a tag merge is too disruptive, skip that cycle and record why in
`ops/CONTROL.md`.

After merging upstream, rebuild and redeploy through the release runbook.

## Where our changes live

**Rule: every customisation is either a new file or a one-line hook into an
existing file.** That keeps `git merge` conflicts confined to a line or two.

| Kind | Location | Upstream knows about it? |
| ---- | -------- | ------------------------ |
| Brand colours, radius, font | `web/src/styles/brand.css` | No — new file |
| Loading brand.css | `web/src/styles/index.css` (one `@import`) | Yes — 1 line |
| Landing page (static, bilingual) | `web/public/brand/home.html` → served at `/brand/home.html` | No — new file |
| Server ops scripts (offsite backup, R2 setup) | `ops/` → copied to `/opt/xseek-new-api/ops/` | No — new directory |
| Future feature code | `web/src/branding/` | No — new directory |
| Future backend hooks | `plugins/` or a new package | No |

Before editing any file upstream owns, ask: can this be a new file plus a
one-line hook instead? If yes, do that.

## Marking customisations

Every edit to an upstream file gets a comment on the changed line:

```css
/* CUSTOM(brand): ... */
```

```go
// CUSTOM(brand): ...
```

Then the full list is one command away:

```bash
git log --grep='CUSTOM(brand)' --oneline
git grep -n 'CUSTOM(brand)'
```

## Rebuilding

The Go binary embeds `web/dist` at compile time (`//go:embed web/dist` in
`main.go`), so a frontend change means a new binary or a new image. It is
**not** possible to swap a built HTML file into a running container.

Local build:

```bash
make build-web   # bun install + rsbuild build -> web/dist
go build -o new-api .
```

Image build (same layers as upstream's Dockerfile):

```bash
ops/build-image.sh <upstream-tag> <n>
```

The script builds `ghcr.io/iokk/bozzii-new-api:<upstream-tag>-bozzii.<n>` for
`linux/amd64`. Follow the release runbook for staging and transfer to production.

## Deploying and operating production

Production runbooks live in [`ops/`](ops/README.md). Start there. Do not
deploy from this document alone: the production instance holds real customer
data, and the steps that matter (backup, staging, cut-over, rollback) are in
`ops/runbooks/`.

- Backups and offsite copies: `ops/runbooks/02-backup.md`
- Restore and proof of restore: `ops/runbooks/03-restore.md`
- Building and cutting over a new image: `ops/runbooks/04-release.md`
- Server layout and secret locations (no values): `ops/runbooks/05-server-inventory.md`

## Unified auth (Casdoor OIDC)

Production (`https://ai.bozzii.com`, container `xseek-new-api`) uses Casdoor at `https://auth.bozzii.com` (organization `bozzii`, application `app-bozzii-api`, callback `https://ai.bozzii.com/oauth/oidc`) as the unified identity provider.

- **Unified Auth UX & Audit extensions (`v1.0.0-rc.51-bozzii.3`, tagged `CUSTOM(brand)`)**:
  - Dedicated brand module `web/src/branding/unified-auth.tsx` + `unified-auth-helpers.ts`: prioritizes Casdoor `/signup/oauth/authorize` on `/sign-up` (hiding local password signup when `PasswordRegisterEnabled=false`), puts Unified SSO primary CTA at top of `/sign-in` with collapsible legacy password/Passkey section + `prompt=login` account switcher, adds 1-time post-signup `state`-loss auto-retry & structured legacy email-conflict guidance on `/oauth/oidc`, supports RP-Initiated Single Logout (`/api/logout`) in `SignOutDialog`, displays `LegacyOidcMigrationBanner` for unlinked legacy users, and clarifies Unified Auth Center credential management on `/security` & `/forgot-password`.
  - Backend login lifecycle audit & admin session control (`model/log.go`, `controller/{user,oauth,auth_session}.go`, `router/api-router.go`): records `login_failed`, `user.register`, `logout`, `session.revoke`, `session.revoke_others`, and `user.sessions_revoke` in `audit_logs`, and exposes `GET/DELETE /api/user/:id/sessions` for admin session inspection & force sign-out.
- **Current production `options` state (2026-11-21)**:
  - `oidc.enabled = true`, `oidc.display_name = 铂子统一账号`, endpoints pointing to `https://auth.bozzii.com`.
  - `RegisterEnabled = true` (required for first-time OIDC user creation).
  - `PasswordRegisterEnabled = false` (blocks new native signups so all new users register through Casdoor).
  - `PasswordLoginEnabled = true` (kept enabled during transition so the root admin and existing users can sign in and bind OIDC in Personal Settings -> Security; disable only after admin + active legacy accounts have bound OIDC).
- **Secrets location (never commit)**: Casdoor admin and OIDC client credentials live only in `/opt/bozzii-auth/CREDENTIALS.txt` (mode `600`) on the Hong Kong host (`server_id: 14`); `oidc.client_secret` is stored in the `options` table of `xseek-new-api-postgres`.

## Billing, Subscription Epay & Wallet UX (v1.0.0-rc.51-bozzii.9)

To keep upstream `sync/upstream-*` merges low-friction while delivering a Subscription-first SaaS experience and safe CNY Epay settlement:

- **Backend Epay Subscription Fix (`CUSTOM(brand)`)**:
  - `controller/subscription_payment_epay.go`: converts USD `plan.PriceAmount` into Epay settlement fiat via `operation_setting.Price` (`getSubscriptionEpayPayMoney`, rounded to 2 dp via `shopspring/decimal`, matching `controller/topup.go:getPayMoney`), stores actual charged fiat in `SubscriptionOrder.Money` (consistent with `top_ups.money` and `BillingHistoryDialog`), gates both `SubscriptionEpayNotify` and `SubscriptionEpayReturn` on `isEpayWebhookEnabled()`, and verifies callback `verifyInfo.Money` against `order.Money` under `LockOrder` (`verifySubscriptionEpayMoney`) before calling `model.CompleteSubscriptionOrder`.
  - Regression suite: `controller/subscription_payment_epay_bozzii_test.go` (run `go test -v ./controller -run 'TestGetSubscriptionEpayPayMoney|TestSubscriptionEpayEndToEnd|TestEpay'`).
  - Zero edits to `model/subscription.go` or `router/api-router.go`.
- **Frontend Subscription-First `/wallet` Architecture (`CUSTOM(brand)`)**:
  - Brand modules (new files, zero upstream conflict): `web/src/branding/wallet.ts`, `web/src/branding/subscription-tier-list.tsx`, `web/src/branding/__tests__/wallet.test.ts`.
  - Thin upstream hooks (all tagged `CUSTOM(brand)`, preserving 100% of native NewAPI wallet features & upstream `web/src/features/wallet/__tests__/copy.test.tsx`):
    - `web/src/features/wallet/index.tsx`: reorders page to `WalletStatsCard` (with quick-jump actions) → `SubscriptionPlansCard` (full-width 4-column pricing matrix) → `RechargeFormCard` (`compactLayout` + `collapseCustomAmount`) → `AffiliateRewardsCard`.
    - `web/src/features/wallet/components/wallet-stats-card.tsx`: monochrome KPI strip + optional `actions` slot.
    - `web/src/features/wallet/components/subscription-plans-card.tsx`: removes nested `TitledCard` chrome; uses `filterSubscriptionEpayMethods` (excludes non-Epay & soft-disabled `min_topup >= $1,000` methods) and mounts `BrandSubscriptionTierList`.
    - `web/src/features/wallet/components/recharge-form-card.tsx`: optional `compactLayout` (defaults to `false` so upstream tests stay green) renders a balanced 2-column Pay-as-you-go + Redemption band and hides soft-disabled payment methods (`filterVisibleTopupMethods`) until custom amount reaches their threshold.
    - `web/src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx`: enables direct Epay with a 1-click primary pay button when a single Epay method is available, while retaining multi-method Combobox, Balance, Stripe, Creem, and Waffo Pancake paths.
- **Upgrade & Roadmap Checklist**:
  1. **Upstream sync**: When merging a newer upstream tag (`sync/upstream-<tag>`), check whether upstream fixes `SubscriptionRequestEpay` currency conversion; if upstream adopts a different setting/formula, reconcile `getSubscriptionEpayPayMoney` and re-run `controller/subscription_payment_epay_bozzii_test.go`.
  2. **Alipay cleanup**: Production `options.PayMethods` currently soft-disables Alipay via `min_topup = 4999` USD. If Alipay is permanently retired, remove the `alipay` entry from `PayMethods` in Admin Settings so it is also blocked at the API layer (`ContainsPayMethod`).
  3. **30-day Plan Wave Rotation**: `model/subscription.go:CountUserSubscriptionsByPlan` enforces `max_purchase_per_user = 1` per `(user_id, plan_id)`. To launch a new promotional wave for returning individual developers without backend changes, disable old `plan_id`s and insert new rows in `subscription_plans`.
  4. **Phase-2 Billing Roadmap**: Add conversion telemetry (Starter → Plus/Pro/Max → wallet overflow rate) and automated VAT invoicing / corporate top-up workflow for Enterprise High-SLA lines. (The `pkg/jsplugin` and `router` Backend CI invariant failures were resolved by registering `/client-config`, `/contact`, and `GET/DELETE /api/user/:id/sessions` in `pkg/jsplugin/routing.go` and `middleware/access_token_routes.go`, and are now guarded by `./ops/pre-pr-check.sh`.)

## Minimalist Dual-State Overview & Support Hub (`v1.0.0-rc.51-bozzii.10`)

- **1-Line Upstream Hook (`CUSTOM(brand)`)**: `web/src/features/dashboard/index.tsx` swaps `OverviewDashboard` import to `BrandOverviewDashboard` (`web/src/branding/overview-dashboard.tsx` + `overview-helpers.ts`), leaving upstream `overview-dashboard.tsx`, `summary-cards.tsx`, and upstream overview tests untouched for zero-conflict merges.
- **Dual-State `/dashboard/overview`**: top 1-line dismissible announcement strip (opens native `AnnouncementDetailModal`), Cold-Start 2-col 3-step launchpad + flagship `deepseek-v4.1-flash` curl snippet, and Active single-screen cockpit combining subscription credits + wallet balance (fixing false "depleted" alerts for subscription users) + 1-line Base URL readiness bar + 7-day monochrome trend chart.
- **Unified `/contact` Support Hub**: preserves exact 4-char sidebar label `联系客服` while hosting 3 tabs (`联系客服 | 常见问答 | 平台公告`, synced via `?tab=faq` / `?tab=announcements`) consuming dynamic `console_setting.faq` & `announcements`.
- **Wallet 4-Tier Preset Grid**: `recharge-form-card.tsx` auto-fits 4/5/6 presets in `compactLayout` (`grid-cols-2 sm:grid-cols-4` for `[10, 50, 100, 500]`).

## Upstream licence

new-api is AGPL-3.0. Serving a modified version over the network obliges us to
offer the modified source to its users. This repository is public, which
satisfies that as long as every deployed change is actually pushed here.
