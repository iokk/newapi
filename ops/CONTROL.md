# CONTROL — master record for the Bozzii new-api deployment

This is the single source of truth. Read it first, then follow the link. When something
changes, update the matching section here **in the same commit** as the change.
Values in this file are non-secret: paths, names, versions, digests, dates. Secret
values never appear here, only where they are kept.

Last full review: 2026-11-05.

## 1. Document map

| Need | Go to |
| ---- | ----- |
| What is true right now | §2 of this file |
| Why a decision was made | §4 of this file |
| What is still open | §5 of this file |
| How to get onto the server | `runbooks/01-access.md` |
| Backup, encryption, offsite, retention | `runbooks/02-backup.md` |
| Proving a backup works, restoring | `runbooks/03-restore.md` |
| Building, staging, cutting over, rolling back | `runbooks/04-release.md` |
| Server layout, containers, cron, secret locations | `runbooks/05-server-inventory.md` |
| Problems we hit and how to prevent them | `runbooks/06-known-issues.md` |
| Daily, weekly, monthly routine | `runbooks/07-daily-operations.md` |
| Per-release record | `releases/` (one file per release) |
| Operator-facing summary (Chinese) | `bozzii/docs/newapi-运维与部署.md` (outside this repo) |

## 2. Current state (2026-11-05)

### Code

| Item | Value |
| ---- | ----- |
| Upstream | `QuantumNous/new-api`, remote `upstream` |
| Our fork | `iokk/newapi`, remote `origin` |
| Working branch | `brand/bozzii` (current head: `git rev-parse --short HEAD`) |
| Upstream base | tag `v1.0.0-rc.48` (commit `706144769`) |
| Customisations | `web/src/styles/brand.css` (new), `web/src/styles/index.css` (one `@import`), `web/public/brand/home.html` (new), `ops/` (new) |
| Marker | every change to an upstream file carries `CUSTOM(brand)`; list with `git grep -n 'CUSTOM(brand)'` |

### Image

| Item | Value |
| ---- | ----- |
| Name | `ghcr.io/iokk/bozzii-new-api` |
| Running tag | `v1.0.0-rc.48-bozzii.3` |
| Platform | `linux/amd64` (matches host `x86_64`) |
| Digest | `sha256:f1e7af2cf0e10b0623e55db96506aaf3048616677303a5af0a04fd04b9efaeb0` |
| Registry visibility | **private** (decision D-006) |
| Built by | `ops/build-image.sh v1.0.0-rc.48 3` (image id `sha256:2c24a329b01c895e08a5a9b409fc53a92c10dc7152f431ad1466f68b6551e7f3`; not pushed to GHCR, loaded on the host via docker save/load) |
| Previous (rollback) | `bozzii.2`, compose saved as `compose.yaml.bak-bozzii2-*` on the host; before that `calciumion/new-api:v1.0.0-rc.44` (`compose.yaml.bak-rc44-*`) |

### Production host

| Item | Value |
| ---- | ----- |
| Host | `154.19.43.98`, Hong Kong, x86_64, Debian 13 |
| Termark asset | `1cc3ef79-f6fe-4aac-913b-34f703da1d8e` |
| App directory | `/opt/xseek-new-api` (compose project) |
| Containers | `xseek-new-api` (app), `xseek-new-api-postgres`, `xseek-new-api-redis` |
| Running since | 2026-11-05, `bozzii.3` cut over from `bozzii.2` (first cut-over from rc.44 earlier the same day) |
| Data at last cut-over | 12 users, 20 channels, 18 tokens, quota sum 1696435798 (channels and quota change as the operator works in the admin UI) |
| Health | `/api/status` → `success: true`, version `v1.0.0-rc.48-bozzii.2`, system name `Bozzii AI` |
| App port | `BIND_ADDRESS=0.0.0.0`, port 3000 (see open item O-4) |

### Backups

| Item | Value |
| ---- | ----- |
| Local | `/opt/xseek-new-api/backups/` (7 days) |
| Offsite | Cloudflare R2 bucket `bozzii`, prefix `newapi/`, public access off |
| Schedule | cron `47 3 * * *` (server time), script `ops/backup-offsite.sh` |
| Retention | 30 days for offsite `*.age` (local 7 days) |
| Encryption | age; private key only on operator's Mac at `~/.config/bozzii-backup/age-key.txt` |
| Last offsite before cut-over | `20261104T214645Z` (uploaded) |
| Last full verification (download + decrypt + compare) | `20261104T203139Z`, byte-identical |
| Last restore test (scratch DB) | passed on `20261104T213150Z`; staging restore matched production counts |

### Environment

| Item | Value |
| ---- | ----- |
| Operator Mac | Apple Silicon, Docker Desktop, `gh` logged in as `iokk` |
| Local proxy | V2Ray (`xray`) mixed port `127.0.0.1:10808`, SOCKS5 and HTTP. Used for git push and GHCR push/pull |
| Build proxy | `ops/build-image.sh` checks the proxy first and passes it as build args |

## 3. Procedures (index)

| Procedure | Script or runbook | Status |
| --------- | ----------------- | ------ |
| Nightly backup and offsite upload | `ops/backup-offsite.sh` (cron) | running |
| R2 connection setup | `ops/setup-r2.sh` (interactive, once) | done |
| Build image | `ops/build-image.sh <upstream-tag> <n>` | verified |
| Staging with production data | `runbooks/04-release.md` stage 2 | done, torn down |
| Cut-over | `runbooks/04-release.md` stage 3 | done 2026-11-05 |
| Rollback | `runbooks/04-release.md` stage 4 | available, not used |
| Restore verification | `runbooks/03-restore.md` | last run 2026-11-04 |

## 4. Decision log

Each decision has a reason. Do not reverse one without reading its reason and writing a new entry.

| ID | Date | Decision | Why |
| -- | ---- | -------- | --- |
| D-001 | 2026-11-04 | Base on upstream **release tags**, not `main` | Tags are what upstream ships; `main` runs ahead |
| D-002 | 2026-11-04 | Run our own image built from the repo; do not inject frontend into the official image | The frontend is embedded in the Go binary at compile time (`//go:embed web/dist`), so injection is impossible |
| D-003 | 2026-11-05 | Registry: GHCR, `ghcr.io/iokk/bozzii-new-api` | Same account as the repo; the `gh` token already had `write:packages`; the host already pulls from `ghcr.io` |
| D-004 | 2026-11-05 | Tag format `<upstream-tag>-bozzii.<n>`; production never uses `latest`; pin digests | Upstream's `latest` moved under us once |
| D-005 | 2026-11-05 | Always build `linux/amd64` and verify the architecture | First image was arm64 from an Apple Silicon build; host is x86_64 |
| D-006 | 2026-11-05 | Keep the GHCR package **private** | Production already runs; the image needs no pulls from elsewhere yet. Public would only expose our brand files, which are not secret, but there is no benefit now. Revisit when a second host needs to pull (see O-7) |
| D-007 | 2026-11-05 | Staging used production data on the same host, bound to `127.0.0.1`, then torn down | Safe verification without touching live data |
| D-008 | 2026-11-05 | Do **not** add a channel for `gemini-3.1-flash-image`; its 503 is expected | Operator decision: no Gemini models for now |
| D-009 | 2026-11-04 | R2 access through an S3 key scoped to one bucket; no custom domain on the bucket | Bucket must stay private; a custom domain makes it public |
| D-010 | 2026-11-04 | Backups are age-encrypted before upload; private key never leaves the Mac | Offsite copies contain customer data and secrets |
| D-011 | 2026-11-04 | Route git and docker traffic through the V2Ray proxy on 10808 | Direct connections to GitHub, GHCR and Docker Hub are unreliable from this network |
| D-012 | 2026-11-05 | Landing page is served by the app at `/brand/home.html` from the image | Keeps the page versioned with the build |
| D-013 | 2026-11-12 | Keep the `metadata.user_id` set operation in channels 4 and 40 `param_override` | Removing it made every plain (non-Claude-Code) Claude request return 503 `only allows Claude Code clients`. Restored from backup and verified with plain requests. See `runbooks/06-known-issues.md` item 12 |

## 5. Open items

Each open item has an owner and a trigger. Close it by changing its status here.

| ID | Item | Risk if ignored | Trigger / next step | Status |
| -- | ---- | --------------- | ------------------- | ------ |
| O-1 | **Rotate R2 keys.** Keys were pasted into a chat during testing. The account token used for testing covers all buckets. | Anyone with the chat log can read or write the offsite bucket | Create a bucket-scoped token, replace in `/root/.config/rclone/rclone.conf` without printing, verify with `rclone lsl`, delete the old token | open |
| O-2 | Verify how channel keys are stored (plaintext or encrypted) | Decides whether `CRYPTO_SECRET` can be rotated safely | Read the model layer for channel key handling; do not rotate until answered | open |
| O-3 | Switch `HomePageContent` from inline HTML to the URL `https://ai.bozzii.com/brand/home.html` | Customers see the old inline page | Done by operator. Verified in database on 2026-11-05: value is the URL. Rollback copy: `backups/homepage-before-url-switch.html` on the host | closed |
| O-4 | App port 3000 is bound to `0.0.0.0`, reachable without the reverse proxy | Bypasses the proxy; exposes the app directly | Confirm the 1Panel OpenResty route to `127.0.0.1:3000`, then set `BIND_ADDRESS=127.0.0.1` in a window | open |
| O-5 | `SESSION_COOKIE_SECURE=false` | Session cookies can travel over plain HTTP | Confirm HTTPS end to end, then set `true` in a window | open |
| O-6 | Channel test on the new version has not been run | An upstream fault would appear only when a customer hits it | Run one low-cost channel test with operator approval (spends upstream quota) | open |
| O-7 | GHCR package private: future hosts need a read token | Pulls from new hosts will fail until configured | When a second host is added: create a read-only token, store it on that host only | deferred |
| O-8 | rclone 1.60 gives a harmless `501` on first upload to R2 | Log noise | Upgrade rclone from the official release | deferred |
| O-9 | `/var/log/xseek-offsite-backup.log` has no rotation | Grows by a line per day; negligible now | Add `logrotate` if it matters | deferred |
| O-10 | Staging and the Gemini 503 | None: Gemini is out of scope (D-008) | Closed by decision | closed |
| O-11 | `/brand/home.html` is served with `Cache-Control: max-age=604800` (7 days). Browsers keep an old copy for a week after any edit. | Customers see stale landing page after a release | Add a versioned file name or a shorter cache header for `/brand/` before the next landing-page edit | closed 2026-11-11: origin `brand-cache.conf` sends `no-cache` for `/brand/home.html` (see O-17); ESA still keeps `/brand/` for 1h |
| O-13 | Header "Docs" button points to the official `https://docs.newapi.pro` (the built-in default), because `general_setting.docs_link` was never set. | Customers are sent to upstream documentation | Operator sets `general_setting.docs_link` to `https://doc.bozzii.com/` in admin → System settings → Site → System information. Verify the button in the header | open, awaiting operator |
| O-14 | Hide the "Wallet" entry. Admin toggle `personal.topup` hides the sidebar and profile-menu entries (set to false on production 2026-11-05). Code change on branch `brand/bozzii` makes the mobile drawer link, the dashboard wallet button, and the setup-guide "Add credits" step follow the same toggle. The `/wallet` route itself stays reachable by URL. | Customers still see the wallet on mobile and the dashboard until bozzii.3 | Done | deployed in bozzii.3 (2026-11-05) |
| O-15 | Top bar: the colour-preset drawer is replaced by a light/dark switch (`ThemeSwitch`); presets, fonts, radius and layout can no longer be changed by users. Language switcher kept. | Users lose font and layout choices (intended) | Deployed with `bozzii.3` | deployed in bozzii.3 (2026-11-05) |
| O-16 | Admin panels on the overview: Uptime Kuma panel is off on production (`console_setting.uptime_kuma_enabled=false`). Announcements panel is still on; no `announcements_enabled` row exists. | Announcement card still shown | Operator turns it off in admin → System settings → Content → Announcements. Check whether the bell icon still lists announcements | open, awaiting operator |
| O-17 | `/brand/home.html` is served by the image (currently bozzii.5), not from disk. OpenResty rule `/opt/1panel/www/sites/ai.bozzii.com/proxy/brand-cache.conf` only proxies that path to the app and sets `Cache-Control: no-cache`. Old disk rule saved as `brand.conf.disabled-20261111` in the same folder. | Deleting `brand-cache.conf` returns the 7-day cache header | A homepage change now needs a new image; then refresh `/brand/home.html` in ESA | closed (state recorded) |
| O-18 | ESA rule `cache-brand-pages` (config 528459570923520, `/brand/`) was changed on 2026-11-11 from `override_origin` 1h to `follow_origin`, and `/brand/home.html` was purged. Before that, ESA nodes held different versions of the homepage (old copy with "99.9" vs new), which showed as a flickering notice bar and changing content. Now every request goes to the origin (1.09 MB, `no-cache`). | Origin bandwidth and request count rise; CDN cost impact not measured | **Reminder: review after a few days of traffic.** If origin bandwidth is a problem: (1) add `ETag` on the origin so revalidation returns 304; (2) or set a short fixed edge TTL (about 60 s) and purge after each release; (3) check gzip/Brotli (size after compression not measured). O-19 removed the shell header around the homepage iframe, so this second check is resolved | open, observing since 2026-11-11 |
| O-19 | Homepage showed two navigation bars (React shell header stacked on the iframe's own banner/nav) and a version badge for anonymous visitors. Root cause: the shell wrapped the iframe in `PublicLayout` and home.html hid its own nav only after JS ran. Fixed in `d00f3c9b4` + `f96904722`: shell renders the iframe without `PublicLayout`, loading state without header, no postMessage of theme/lang; `data-in-iframe` CSS removed. Deployed as `bozzii.5` (digest `sha256:626875995f88…`, image loaded on host via `docker load`, no staging run — frontend-only change). | Logged-in users lose the shell profile menu on the homepage only; they use the page's 控制台 link. Old cached home.html (7-day header era) can still show for returning visitors until browser cache expires or they force-refresh | After deploy: check logged-in view, Safari/Firefox, and whether any returning visitor still reports the old page | closed 2026-11-12 |
| O-12 | Admin changes to options (for example `HomePageContent`) are held in server memory. Editing the database directly does not take effect until the app restarts. | A direct SQL edit looks applied but is not | Make all option changes through the admin UI or API only | rule |
| O-20 | **Rotate the nbwly test key.** It was printed in chat and written into a pushed commit (`27061425a`, `bugfix-log.md`). Channels 4 and 40 also use nbwly keys. | Anyone with repository or chat access can spend the upstream quota | Create a new key in the nbwly console, enter it in channels 4 and 40 through the admin UI only, verify with a plain request, then retire the old key. Never print a key in shell output | open |
| O-21 | Decide whether to remove the leaked key from git history (force-push to `brand/bozzii`) | A force-push rewrites shared history, and the old key stays valid until O-20 is done either way | Operator decision, after O-20. Check whether `iokk/newapi` is public first | open |
| O-22 | Root cause of the Claude Opus first-byte tail (40 to 144 s) is unknown | Customers wait a long time. The SSE ping keeps the connection alive but does not shorten the wait | The earlier conclusion that the identity override caused the tail is withdrawn (see `bugfix-log.md`, 2026-11-12 correction). Facts: one upstream attempt, no gateway retry, the wait is on the upstream first byte. Daily check: scheduled task `opus-frt-daily-check` at 09:07. Next: compare a real Claude Code client and the gateway with the same identity, and ask nbwly how it assigns account slots | open |

## 6. Change log

| Date | Change | Commit or record |
| ---- | ------ | ---------------- |
| 2026-11-04 | Fork created; brand CSS; FORK.md | `c60a3a4bf` |
| 2026-11-04 | Landing page; offsite backup scripts; R2 verified | `bcd39430a`, `92d3b8829`, `c6e18dfb9` |
| 2026-11-04 | Runbooks 01–05 | `4ac81ee48` |
| 2026-11-05 | Registry decision; build script | `50abf2f08`, `b470dd65d` |
| 2026-11-05 | amd64 build fix; known-issues runbook | `cc1e96777` |
| 2026-11-05 | Production cut-over to rc.48-bozzii.2 | see `releases/rc48-bozzii2.md` |
| 2026-11-05 | Wallet entry points follow admin switch; theme drawer replaced by light/dark switch; cut-over to rc.48-bozzii.3 | `f3ae32bb5`, see `releases/rc48-bozzii3.md` |
| 2026-11-06 | ESA cache rules for ai.bozzii.com `/static/` (7d) and `/brand/` (1h). Not `/` or `/api/`. | SiteId 184042911097052, configs 528459549947904 and 528459570923520 |
| 2026-11-11 | Landing page replaced by the new interactive version (about 1.09 MB, inline CSS/JS/images); workbench links point to `https://xingyuqiusuo.com/product.html`; served from disk on the origin (O-17). Pricing page opens as a table; "Model Square" renamed "Model Pricing" | see git log on `brand/bozzii` |
| 2026-11-11 | Hard availability and compliance claims removed from the landing page; copied to the origin | `f67c796af`, see `releases/2026-11-11-landing-and-pricing.md` |
| 2026-11-11 | Cut over to `v1.0.0-rc.48-bozzii.4` (digest `sha256:f3043336...`), image loaded on host via `docker load` because GHCR pull returned unauthorized; pre-cut backup in `/opt/xseek-new-api/backups/`; no staging run; `brand-cache.conf` added | see git log |
| 2026-11-11 | ESA `/brand/` cache rule changed to follow origin; `/brand/home.html` purged (task 1777760391397379); public check: 5 requests returned the new 1,092,910-byte page with `no-cache` | see O-18; AccessKey was pasted in chat, rotate it |
| 2026-11-12 | Single navigation on the homepage: shell header removed around the iframe, theme/lang postMessage removed, `data-in-iframe` CSS deleted; reviewed by a subagent (no Critical), verified locally at desktop and 390 px mobile; image `bozzii.5` cut over | commits `d00f3c9b4`, `f96904722`; release note `ops/releases/2026-11-12-homepage-single-nav.md`; pre-cut compose backup `compose.yaml.pre-bozzii5-202611111927` |
| 2026-11-12 | Identity override removed, plain requests failed with 503, override restored; `bugfix-log.md` correction; known-issues items 12 to 14; D-013; O-20 to O-22 | see git log on `brand/bozzii` |

## 7. Rules for editing these documents

1. Change the fact in the section where it lives. Do not repeat it elsewhere; link to this file.
2. Every decision gets a new `D-` number. Never renumber.
3. Every open item stays until its status is `closed`, with the reason.
4. Commit documentation changes with the change they describe.
5. Never write a secret value, even a masked one, into any file in this directory.
