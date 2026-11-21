# Release: `v1.0.0-rc.51-bozzii.3` — Unified Auth Center UX, Legacy Guidance, Login Audit & Branch Reconciliation (2026-11-21)

## Summary

1. **Git / Branch Reconciliation**:
   - Merged `upgrade/v1.0.0-rc.51` cleanly into `main`, eliminating drift between `origin/main` (previously `rc.48`) and live production (`v1.0.0-rc.51-bozzii.2`).
2. **Unified Auth Center (Casdoor OIDC) Registration & Login Priority (`CUSTOM(brand)`)**:
   - New dedicated brand modules: `web/src/branding/unified-auth.tsx`, `web/src/branding/unified-auth-helpers.ts`, `web/src/branding/__tests__/unified-auth.test.tsx`.
   - `/register` → `/sign-up`: respects `register_enabled` and `password_register_enabled`; hides broken local password form when `password_register_enabled=false` and renders the primary **铂子统一账号** signup card directly routing to Casdoor `/signup/oauth/authorize` (preserving `redirect` & `aff` referral code, resolving existing sessions on cold load).
   - `/login` → `/sign-in`: renders solid primary **使用 铂子统一账号 登录** CTA + `prompt=login` account-switch button at top (aligned with `shop.bozzii.com`), removes stray top divider, and collapses legacy password/Passkey login cleanly behind a toggle (auto-expanded on `?legacy=1`).
   - `/oauth/oidc`: adds 1-time automatic re-authorization when Casdoor signup returns without `code`/`state`; renders structured legacy email-collision guidance (`OAuthEmailConflictCard`) directing users to sign in with their legacy password and bind in `/security`.
   - Single Logout (SLO): `SignOutDialog` defaults to checking "Also sign out of 铂子统一账号 (Unified Auth Center)" and redirects to `https://auth.bozzii.com/api/logout?post_logout_redirect_uri=...` after local logout.
   - Online Guidance: `LegacyOidcMigrationBanner` shown to logged-in users without `oidc_id`; `/security` displays `铂子统一账号` instead of literal `OIDC` + Auth Center management link; `/forgot-password` directs unified accounts to `auth.bozzii.com/forget/app-bozzii-api`; `PublicHeader` preserves `?redirect=` on Sign in.
3. **Login Lifecycle Audit & Admin Session Management (`CUSTOM(brand)`)**:
   - Persists `login_failed`, `user.register`, `logout`, `session.revoke`, `session.revoke_others`, and `user.sessions_revoke` into `audit_logs` with localized frontend labels in `/usage-logs/audit`.
   - Adds `GET /api/user/:id/sessions` and `DELETE /api/user/:id/sessions` plus `AdminUserSessionsDialog` in `/users` row actions.
4. **Production Security Hardening**:
   - Enables `SESSION_COOKIE_SECURE="true"` + `SESSION_COOKIE_TRUSTED_URL="https://ai.bozzii.com"` in `/opt/xseek-new-api/compose.yaml`.
   - Cleans stale `http://localhost:3000` and `http://147.224.171.79:3000` from `passkey.origins`.

## Verification

- **Go Tests**: `go test ./controller -run "TestUnifiedAuthAuditAndAdminSessions|TestAuth|TestOAuth|TestSession|TestLogin"` — PASS.
- **Frontend Tests**: `vitest run` (`src/branding/__tests__/`, `src/features/auth/`, `src/features/security/`, `src/features/usage-logs/audit/`) — 21/21 files PASS.
- **Lint & Typecheck & Build**: `oxlint` 0 warnings / 0 errors; `tsc --noEmit` 0 errors; `rsbuild build` clean.
- **Staging & Production Cut-over**: Verified on `xseek-staging` (`:3100`) and cut over `xseek-new-api` (`:3000`) with `docker compose up -d --no-deps new-api`.

## Rollback

Restore `/opt/xseek-new-api/backups/compose.yaml.pre-rc51-bozzii3-*` (points to `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.2`) and run `docker compose up -d --no-deps new-api`. No database schema migration is required to roll back.
