# Release: `v1.0.0-rc.51-bozzii.4` — Model Plaza Telemetry, Brand 404 Fixes, Onboarding & Auth UX Polish (2026-11-21)

## Summary

Built cleanly on top of `v1.0.0-rc.51-bozzii.3` (`main` @ `c0af3bb14`, preserving all Unified Auth Center, SLO, and login audit features):

1. **`/pricing` Model Plaza Upgrade (`CUSTOM(brand)`)**:
   - New brand modules: `web/src/branding/pricing-telemetry.ts`, `web/src/branding/brand-telemetry-banner.tsx`, `web/src/branding/__tests__/pricing-and-auth.test.ts`.
   - **Private group filtering**: filters displayed `enable_groups` against `usableGroup` across pricing table, model cards, details drawer, auto-group chain, and performance tab (hides internal `鹅组开发 / 鹅组测试 / XSEEK官方`).
   - **Human-readable image floor billing**: parses `max(p * ..., 40000|100000 * (image_count ...))` formulas into clean per-image floor (`Min per image / image`) + token/cache prices with accurate standard & recharge currency math, eliminating raw `100000` / `"Special billing expression"` blocks.
   - **Zero fake data**: removes synthetic seeded-random `RateLimitsSection` (`mock-stats.ts`) from `model-details-api.tsx`.
   - **Real 7-day telemetry & canary proof**: wires `/brand/telemetry.json` into `CachedPriceCell`, `ModelCard`, and `BrandTelemetryBanner` (`ModelDetailsPerformance`), displaying 7-day production cache hit rate, success rate, P50 latency, and `1.00x` canary billing verification (never renders failed probes in green).
2. **15 Fixed Brand 404 Links, Same-Origin Homepage & Onboarding**:
   - Fixes all broken `/token`, `/log`, `/topup`, `/login` links in `web/public/brand/home.html` and `connect.html`, aligns API host examples to `https://api.bozzii.com`, uses safe `textContent` in toast, and hides redundant Sign In link when `new_api_has_session=1`.
   - Adds top-level legacy redirects (`/token` → `/keys`, `/log` → `/usage-logs/common`, `/topup` → `/wallet`) in `web/src/lib/legacy-route.ts`.
   - Enables trusted same-origin rendering + `clipboard-write` for first-party `/brand/home.html` iframe while keeping third-party URLs strictly sandboxed (`web/src/features/home/index.tsx`).
   - `/client-config` defaults to first `ready` target; Console Overview adds `Client Setup` quick action + Feishu trial/VAT invoicing notice when wallet is hidden; `LoginSessionsCard` passes reactive `oidc_display_name` (`铂子统一账号`) to `LoginSessionItem`.
3. **Auth & Backend Polish**:
   - `/sign-in`: keeps legacy password form expanded below `UnifiedAuthPrimaryCard` (visually demoted `outline` submit) per operator preference; places `LegalConsent` above primary OIDC CTA with click validation on both `/sign-in` and `/sign-up`; forwards `redirect` on mobile `PublicHeader` Sign in.
   - `oauth/oidc.go`: trims trailing `/` from `ServerAddress`; `service/client_link.go`: honors `setting.DefaultUseAutoGroup`.

## Verification

- **Go Tests**: `go test ./oauth/... ./service/...` + `go test ./controller -run "TestUnifiedAuthAuditAndAdminSessions"` — PASS.
- **Frontend Tests**: 33/33 test files across `branding/__tests__/`, `auth/`, `security/`, `pricing/__tests__/`, `dashboard/components/overview/` — PASS.
- **Lint & Build**: `oxlint` 0 warnings / 0 errors; `rsbuild build` clean; two-axis `code-review` (Standards + Spec) applied prior to release.
- **Production Cut-over**: Built `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.4` (`linux/amd64`) natively on `23.19.228.138`, uploaded `home.html` & `connect.html`, cut over `xseek-new-api` via `docker compose up -d --no-deps new-api`, purged ESA cache, and verified live in browser.

## Rollback

Restore `/opt/xseek-new-api/backups/compose.yaml.pre-bozzii.3.*` (points to `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.3`) and run `cd /opt/xseek-new-api && docker compose up -d --no-deps new-api`. No DB migration is involved.
