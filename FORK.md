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

## Updating from upstream

```bash
git fetch upstream --tags
git merge upstream/main
```

Then rebuild and redeploy (see [Rebuilding](#rebuilding)).

Tag releases (`v1.0.0-rc.47`, …) are what upstream actually ships; `main` runs
slightly ahead. Merging `main` is fine and keeps us current. If a merge ever
gets ugly, merge the previous release tag instead and skip that one cycle.

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
docker build -t bozzii/new-api:$(cat VERSION) .
```

## Deploying and operating production

Production runbooks live in [`ops/`](ops/README.md). Start there. Do not
deploy from this document alone: the production instance holds real customer
data, and the steps that matter (backup, staging, cut-over, rollback) are in
`ops/runbooks/`.

- Backups and offsite copies: `ops/runbooks/02-backup.md`
- Restore and proof of restore: `ops/runbooks/03-restore.md`
- Building and cutting over a new image: `ops/runbooks/04-release.md`
- Server layout and secret locations (no values): `ops/runbooks/05-server-inventory.md`

## Upstream licence

new-api is AGPL-3.0. Serving a modified version over the network obliges us to
offer the modified source to its users. This repository is public, which
satisfies that as long as every deployed change is actually pushed here.
