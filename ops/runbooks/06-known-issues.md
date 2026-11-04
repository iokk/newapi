# 06 — Known issues and how to prevent them

Each entry is something that actually happened during the first production release
(2026-11-05), with the symptom, the cause, and the check that stops it next time.

## Image and build

**1. Image built for the wrong CPU architecture.**
- Symptom: container exits at once with `exec /new-api: exec format error`.
- Cause: building on Apple Silicon without `--platform`. The image is arm64; the host is x86_64.
- Prevention: `ops/build-image.sh` always uses `--platform linux/amd64` and fails if the
  result is not `linux/amd64`. Before any transfer, check `docker image inspect --format '{{.Os}}/{{.Architecture}}'`.
- Host architecture: `uname -m` must print `x86_64`.

**2. Base-image pulls time out during build (Docker Hub, IPv6).**
- Symptom: `failed to fetch anonymous token … auth.docker.io … i/o timeout`.
- Cause: the build resolves Docker Hub over IPv6 and times out on this network.
- Prevention: route through the V2Ray mixed proxy (`127.0.0.1:10808`, SOCKS5 and HTTP).
  Pre-pull every pinned base image **for the target platform**, with retries, before building:
  `docker pull --platform linux/amd64 <image>@<digest>`. A cache of arm64 images does not help an amd64 build.

**3. Build fails on an uncommitted tree.**
- Symptom: `tracked files have uncommitted changes`.
- Cause: the script refuses to build something that is not what the commit says. This is intended.
- Prevention: commit or stash first.

**4. Version stamp empty.**
- Symptom: `VERSION` file is empty in the repository.
- Cause: upstream writes the tag into `VERSION` in CI; the repository copy is empty.
- Prevention: `ops/build-image.sh` writes it before the build and restores it on exit.

## Registry

**5. Push is denied on first attempt.**
- Symptom: `denied` from `docker push ghcr.io/…`.
- Cause: the login session was stale. Re-login with `gh auth token | docker login ghcr.io -u iokk --password-stdin`.

**6. Package is private, so the server or anyone else cannot pull it.**
- Symptom: anonymous manifest fetch returns `403`.
- Cause: GHCR packages are private by default. The REST API cannot change visibility for a
  container package (`PATCH user/packages/container/…` returns 404).
- Prevention: set visibility to public once in the GitHub web UI (Packages → bozzii-new-api →
  Package settings → Change visibility). Verify with an anonymous token request.

## Network and proxy

**7. Git push or GHCR calls time out intermittently.**
- Symptom: `Failed to connect to github.com port 443 after 75 s`.
- Prevention: run git and docker through `HTTPS_PROXY=http://127.0.0.1:10808`. Confirm the
  proxy first: `curl -x http://127.0.0.1:10808 https://auth.docker.io/`.

## Staging and cut-over

**8. Staging compose still points at a tag that was never pushed.**
- Symptom: `pull_policy: never` fails because the image is not on the host.
- Prevention: load the image on the host (`docker save | gzip | … | docker load`) before
  changing the tag in compose, and confirm with `docker image inspect` on the host.

**9. Staging data is a copy of production.**
- Prevention: staging binds only to `127.0.0.1`, uses its own secrets, and is torn down
  right after cut-over (`docker compose down -v`, then remove the directory). Do not leave it running.

**10. Compose secrets are placeholders in staging.**
- Staging uses `staging-only-…` values on purpose. Never copy staging compose values back into production.

**11. Model with no channel returns 503.**
- Symptom: `无可用渠道` / `503` on `/v1/chat/completions` for a model.
- Cause: no channel in the database lists that model in its `models` field. This is a configuration
  gap, not an upgrade fault. Check with:
  `SELECT id,name,status,models FROM channels WHERE models ILIKE '%<model>%';`

## Memory and cache (to check before every release)

These have not been observed on this host yet. They are checks to run, with the threshold to act on.

- **Build memory:** `docker stats` during `build-image.sh`. Stop the build if the builder
  exceeds half of host RAM (24 GB → 12 GB). Go and bun builds are the heavy steps.
- **Build cache growth:** `docker system df`. Last reading: build cache 5.0 GB. Prune with
  `docker builder prune --keep-storage 10GB` once it exceeds 10 GB.
- **Database connections:** `SQL_MAX_OPEN_CONNS=50`, `SQL_MAX_IDLE_CONNS=10` in production. If
  `SELECT count(*) FROM pg_stat_activity WHERE datname='newapi';` approaches 50, investigate before a release.
- **Redis memory:** `docker exec xseek-new-api-redis redis-cli -a … INFO memory` (use the password
  from `.env` without printing it). Alert if `used_memory` grows week over week.
- **Log growth:** the `logs` table is about 30 MB per month. Track it with the table-size query in
  `runbooks/02-backup.md`.
- **Host disk:** `df -h /` must stay below 80%. Current use is 17%.
