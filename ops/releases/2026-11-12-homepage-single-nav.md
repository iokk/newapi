# 2026-11-12 Homepage: keep one navigation bar

## Problem (measured on live site)
The homepage is the React shell (`web/src/features/home/index.tsx`) wrapping an iframe of `/brand/home.html`.
- The shell rendered its own fixed 64 px `PublicHeader` (logo, nav, language, theme, bell, login) on top of the iframe.
- `home.html` has its own announcement bar and navigation. It hid them with `html[data-in-iframe="true"]`, set by JS after load, so for a moment two bars showed, then only the shell bar floated over the hero.
- Result: "layers on layers", a bell plus a separate announcement bar, and a visible switch while loading.

## Decision
`home.html` is a complete landing page. Keep its navigation. The shell shows no header around the iframe.

## Checked, no change needed
- Version badge in the header: `SystemUpdateAction` already returns `null` for non-admins. Only admins (including the browser used for testing) see it.

## Changes
1. `web/src/features/home/index.tsx`: in the iframe branch render the iframe alone (no `PublicLayout`). The loading state also renders without the header, so no header appears and then disappears.
2. `web/public/brand/home.html`: delete the `html[data-in-iframe="true"]` CSS block so its own banner, nav and hero spacing show. The JS flag stays (harmless).

## Side effects to accept
- Logged-in users on `/` lose the shell header (profile menu, version badge for admins) on the homepage only; they use the page's "进入控制台" link. Other routes are unchanged.
- The page's own nav says "模型广场" and "接入指南"; the app renamed the pricing page to "模型定价". Not changed here; decide separately.

## Verified locally (2026-11-12)
`tsc` and `oxlint` pass; `bun run build` ok; patched build against a mock API: 0 shell headers at 0.5 s, 1.9 s and 4.4 s, only the page's own banner and nav visible (desktop width). Not yet verified: logged-in view, mobile width, production.

## Verify after deploy
- `bunx tsc --noEmit` and lint on the changed file.
- After deploy: open `/` logged out and logged in; one nav bar only, no flash during load; check mobile width.

## Deploy
Needs a new image (`bozzii.5`) because the homepage is served from the image (O-17). Follow `runbooks/04-release.md`; then purge `/brand/home.html` in ESA if needed (cache rule is now follow-origin, O-18).

## Rollback
Revert the commit, rebuild the image, or set compose tag back to `bozzii.4`.
