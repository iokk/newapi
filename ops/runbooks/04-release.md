# 04 — Release: build our image, stage it, cut over

**Status: planned, not executed.** Nothing in this runbook has changed production.
Work through the stages in order. Each stage has a gate; do not move on until the
gate passes and the operator has agreed.

## Why we build our own image

The Go binary embeds the frontend at compile time (`main.go`, `//go:embed web/dist`).
A brand change therefore needs a new binary, which means a new image. The official
Dockerfile in the repository already does the whole build (bun for the frontend, then
Go), so we use it unchanged and build from our fork's branch.

## Version policy

- Track upstream **release tags** (`v1.0.0-rc.N`), not `main`. Tags are what upstream
  ships; `main` runs ahead of them.
- Upgrade one tag at a time when the gap is more than one release, so each database
  migration is tested in isolation.
- Security fixes in upstream release notes are applied first.

Current gap: production is `rc.44`; upstream latest is `rc.48` (includes a Redis auth
cache fix, `#8200`).

## Stage 0 — Prepare the merge (on the operator's Mac, in `bozzii-newapi`)

```bash
cd /Users/qi/cludecode/bozzii-newapi
git fetch upstream --tags
git checkout brand/bozzii
git merge v1.0.0-rc.48        # or the tag being targeted
```

Resolve conflicts only in files that carry a `CUSTOM(brand)` marker. Search with:

```bash
git grep -n 'CUSTOM(brand)'
```

Gate: `git merge` completes, and `git grep` shows no marker on a file that upstream
has rewritten without our hook. If a marker is lost, re-apply it by hand and note it
in the commit message.

## Stage 1 — Build the image

Build from the merged tree. Use the upstream Dockerfile.

```bash
cd /Users/qi/cludecode/bozzii-newapi
docker build -t ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.1 .
```

Push (after Stage 2 passes, not before):

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u iokk --password-stdin   # token from gh auth, never printed
docker push ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.1
docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.1
```

Registry decision (2026-11-05): **GitHub Container Registry**, image
`ghcr.io/iokk/bozzii-new-api`, public visibility. Why: same account as the repository,
the operator's `gh` token already has `write:packages`, and the production host already
pulls from `ghcr.io` (nezha, skillhub). The image contains no secrets; runtime
configuration comes from `.env` on the host.

Tag rule: `<upstream release>-bozzii.<n>`, for example `v1.0.0-rc.48-bozzii.1`.
Production `compose.yaml` must reference a version tag, never `latest`, and should
record the image digest (`@sha256:…`) of the build it was tested with.

Gate: the build finishes. Then start the image on a throwaway port with no data and check
that `/api/status` answers with `"success":true`. Do not rely on a version flag; verify the
version through the `/api/status` response or the image labels, and confirm the exact field
name on first use.

## Stage 2 — Staging with production data

Staging must not connect to production.

1. Take a fresh backup on the host (`02-backup.md` §2).
2. Restore it into a staging database (`03-restore.md` §3) on a separate compose
   project with different container names and ports, bound to `127.0.0.1` only.
3. Start staging with the new image. Run migrations there first.
4. Check, in order:
   - the app starts and `/api/status` returns `success: true`
   - admin login works
   - channel list shows all channels; run a channel test on one non-sensitive channel
   - user balances match production (same query as `03-restore.md` §1)
   - the home page loads with the Bozzii brand (colour, logo, `HomePageContent`)
   - one real API call through a test token succeeds, if the operator approves a
     test upstream call (it spends upstream quota)
5. Record the results in `ops/runbooks/release-log.md` (create it for each release).

Gate: all checks pass and the operator has seen the results.

## Stage 3 — Cut over (maintenance window)

Announce the window to the three enterprise customers first. Pick a low-traffic time.

1. Take a final backup and confirm it is uploaded to R2.
2. Stop writes: put the old app into maintenance by stopping only `xseek-new-api`
   (`docker compose stop new-api`). Leave postgres and redis running.
3. Change the image tag in `compose.yaml` to the new image. Keep the old tag written
   in a comment so rollback is a one-line edit.
4. `docker compose up -d new-api`. The container will run migrations on start.
5. Watch the healthcheck and logs until `/api/status` is healthy and the admin page
   loads.
6. Run the checks from Stage 2 step 4 against production, read-only where possible.

Do not stop postgres or redis during a cut-over. Do not run `docker compose down`
(that removes the network and can disturb the other services).

## Stage 4 — Rollback

If the new version fails and cannot be fixed within the window:

1. Stop the new container: `docker compose stop new-api`.
2. Put the old image tag back in `compose.yaml`.
3. `docker compose up -d new-api`.
4. If migrations have already changed the schema and the old version cannot read it,
   restore the pre-cut-over dump into the `newapi` database (`03-restore.md` §1,
   adapted to write to `newapi` after stopping `new-api`). This is destructive; the
   operator must approve it explicitly.

Keep the old image tag on the host until the new version has run for 24 hours.

## Stage 5 — After cut-over

- Keep the pre-cut-over backup for at least 30 days, outside the 30-day R2
  retention window if it is a release backup. Copy it to a separate R2 prefix
  `releases/<tag>/`, which retention does not touch.
- Update `ops/README.md` "Current status".

## Things the operator still has to decide

- Registry for our image.
- Maintenance window and customer notice.
- Whether `SESSION_COOKIE_SECURE` changes from `false` to `true` in the same window.
  Only if the site is HTTPS end to end. Verify first.
- Rotation of the database, Redis, and session secrets. Doing this in the same
  window logs every user out. Decide whether to combine or separate.
