# Release: `v1.0.0-rc.51-bozzii.6` — Frontend-Only Hiding of Group Information on `/pricing` (2026-11-21)

## Summary

1. **Frontend-only Pricing Group Hiding (`CUSTOM(brand)`)**:
   - Added centralized toggle `SHOW_PRICING_GROUPS = false` in `web/src/branding/pricing.ts`.
   - `web/src/features/pricing/components/pricing-columns.tsx`: omits the `Groups` (`enable_groups`) column from the pricing table.
   - `web/src/features/pricing/components/model-card.tsx`: suppresses the card-footer `Groups` badge and overflow tooltip.
   - `web/src/features/pricing/components/pricing-sidebar.tsx`: hides the `Groups` filter section in both the desktop sidebar and mobile filter drawer.
   - `web/src/features/pricing/hooks/use-filters.ts`: ignores `?group=` query parameters while `SHOW_PRICING_GROUPS` is `false`.
   - `web/src/features/pricing/components/model-details.tsx`: hides the `Groups` metadata cell, `AutoGroupChain`, `"Pricing by Group"` heading, `GroupBadge` / `Ratio` columns/headers (across standard, image-floor, and video-tier tables), and collapses multi-group blocks to a single price view while keeping plugin variant tabs and tiered prices intact.
   - No Go backend changes (`controller/pricing.go` left untouched per operator decision).

## Verification

- **Frontend Tests**: `vitest run` on all pricing, branding, and model-listing suites PASS.
- **Lint & Format & Typecheck & Build**: `oxlint` 0 warnings / 0 errors; `oxfmt --check` PASS; `tsc --noEmit` PASS; `rsbuild build` clean.
- **Staging & Production Cut-over**: Built `linux/amd64` image via `ops/build-image.sh v1.0.0-rc.51 6`, staged on `xseek-staging` (`:3100`), then cut over `xseek-new-api` (`:3000`).

## Rollback

Restore `/opt/xseek-new-api/backups/compose.yaml.pre-rc51-bozzii6-*` (points to `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.5`) and run `docker compose up -d --no-deps new-api`. No database schema migration is required to roll back.
