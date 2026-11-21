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
# Make the change and run the checks that cover it.
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

- **No backend fork changes required**: upstream `controller/oauth.go` natively handles OIDC user creation (`users.oidc_id`), skips `EmailDomainWhitelist` for OIDC signups, and rejects duplicate emails via `EnsureEmailAvailable` (`OAuthEmailAlreadyTakenError`) to prevent account takeover.
- **Current production `options` state (2026-11-19)**:
  - `oidc.enabled = true`, `oidc.display_name = 铂子统一账号`, endpoints pointing to `https://auth.bozzii.com`.
  - `RegisterEnabled = true` (required for first-time OIDC user creation).
  - `PasswordRegisterEnabled = false` (blocks new native signups so all new users register through Casdoor).
  - `PasswordLoginEnabled = true` (kept enabled during transition so the root admin and existing users can sign in and bind OIDC in Personal Settings -> Security; disable only after admin + active legacy accounts have bound OIDC).
- **Secrets location (never commit)**: Casdoor admin and OIDC client credentials live only in `/opt/bozzii-auth/CREDENTIALS.txt` (mode `600`) on the Hong Kong host (`server_id: 14`); `oidc.client_secret` is stored in the `options` table of `xseek-new-api-postgres`.

## Upstream licence

new-api is AGPL-3.0. Serving a modified version over the network obliges us to
offer the modified source to its users. This repository is public, which
satisfies that as long as every deployed change is actually pushed here.
