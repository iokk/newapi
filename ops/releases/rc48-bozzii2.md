# Release record: v1.0.0-rc.48-bozzii.2

Date: 2026-11-05. Operator: iokk (Mac). Executed with assistant support, following
`runbooks/04-release.md`.

## What was released

| Item | Value |
| ---- | ----- |
| Image | `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.2` |
| Digest | `sha256:f1e7af2cf0e10b0623e55db96506aaf3048616677303a5af0a04fd04b9efaeb0` |
| Platform | linux/amd64 |
| Upstream base | `v1.0.0-rc.48` |
| Source commit | `b9ddc4155` (build input); branch `brand/bozzii` |
| Replaced | `calciumion/new-api:v1.0.0-rc.44` |

## Sequence

1. Fresh backup before the change, uploaded to R2 (`20261104T213150Z`).
2. Staging: restored the backup into an isolated postgres on the host, bound to
   `127.0.0.1:3100`. Application started. Counts matched production (12 / 22 / 18 / 1754322390).
   Channel fingerprint matched production.
3. Final pre-cutover backup (`20261104T214645Z`), uploaded to R2. Rollback copy of compose saved.
4. Cut-over: changed only the `new-api` image tag and ran `docker compose up -d --no-deps new-api`.
   Postgres and Redis were not restarted.
5. Post-cutover: healthy, version and system name correct, counts unchanged.
6. Staging torn down with `docker compose down -v`; its directory removed.

## Failures on the way (all fixed; see `runbooks/06-known-issues.md`)

- First image was arm64. Staging failed with `exec format error`. Removed; rebuilt amd64.
- Docker Hub timed out during build. Solved by pre-pulling pinned base images for the target
  platform through the V2Ray proxy.
- First GHCR push was denied because of a stale login. Re-login fixed it.
- Package visibility left private (D-006).

## Verification

- `/api/status` → `success: true`, version `v1.0.0-rc.48-bozzii.2`.
- Landing page and brand colour present in the image.
- No secret files (`.env`, keys, dumps) in the image filesystem.
- Staging and production channel fingerprints matched before cut-over.

## Known after release

- Model `gemini-3.1-flash-image` returns 503. No channel is configured for it, by decision (D-008).
- App port 3000 is bound to `0.0.0.0` (O-4).
- Channel test on this version not yet run (O-6).

## Rollback (if needed)

```bash
termark exec 1cc3ef79-f6fe-4aac-913b-34f703da1d8e "cd /opt/xseek-new-api && cp compose.yaml compose.yaml.bak-bozzii2 && cp compose.yaml.bak-rc44-* compose.yaml && docker compose up -d --no-deps new-api"
```

Use the exact file name for the rc44 copy (`ls compose.yaml.bak-rc44-*`). Do not restore a
database unless the schema has changed in a way the old version cannot read; see
`runbooks/04-release.md` stage 4.
