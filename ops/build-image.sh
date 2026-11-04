#!/bin/sh
# CUSTOM(brand): reproducible local build of the Bozzii image.
#
# Mirrors upstream's release workflow, which writes the git tag into VERSION
# before docker build (.github/workflows/docker-build.yml). The Dockerfile reads
# VERSION for the frontend build stamp and the Go -ldflags version.
#
# Usage: sh ops/build-image.sh <upstream-tag> <bozzii-build-number>
#   e.g. sh ops/build-image.sh v1.0.0-rc.48 2
#
# Always builds for linux/amd64, the production host's architecture. Building
# on an Apple Silicon Mac without --platform produces an arm64 image that dies
# with "exec /new-api: exec format error" on the server. The architecture is
# verified after the build; never ship an image whose arch check failed.
#
# Builds only. Does not push. Run from the repository root.
set -eu

UPSTREAM_TAG="${1:?usage: build-image.sh <upstream-tag> <build-number>}"
BUILD_N="${2:?usage: build-image.sh <upstream-tag> <build-number>}"
IMAGE_TAG="${UPSTREAM_TAG}-bozzii.${BUILD_N}"
IMAGE="ghcr.io/iokk/bozzii-new-api:${IMAGE_TAG}"

# Refuse to build a tree that is not exactly what we claim to be.
git rev-parse -q --verify "refs/tags/${UPSTREAM_TAG}" >/dev/null || { echo "unknown upstream tag ${UPSTREAM_TAG}" >&2; exit 1; }
git merge-base --is-ancestor "${UPSTREAM_TAG}" HEAD || { echo "HEAD does not contain ${UPSTREAM_TAG}; merge first (ops/runbooks/04-release.md stage 0)" >&2; exit 1; }
test -z "$(git status --porcelain --untracked-files=no)" || { echo "tracked files have uncommitted changes; commit or stash first" >&2; exit 1; }

docker info >/dev/null 2>&1 || { echo "Docker daemon is not running" >&2; exit 1; }

# Operator's network path: V2Ray (xray) mixed proxy on the Mac at 10808, which
# accepts both SOCKS5 and HTTP. Builds and pulls go through it; a dead proxy
# must fail fast here instead of hanging in a registry call.
PROXY="${BOZZII_PROXY:-http://127.0.0.1:10808}"
curl -s -o /dev/null --max-time 10 -x "$PROXY" https://auth.docker.io/ || { echo "proxy $PROXY not reachable; start V2Ray first" >&2; exit 1; }

trap 'git checkout -- VERSION' EXIT
printf '%s\n' "$IMAGE_TAG" > VERSION

docker buildx build --platform linux/amd64 --load \
  --build-arg HTTP_PROXY=http://host.docker.internal:10808 \
  --build-arg HTTPS_PROXY=http://host.docker.internal:10808 \
  --build-arg NO_PROXY=localhost,127.0.0.1 \
  --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
  --label "org.opencontainers.image.version=${IMAGE_TAG}" \
  --label "org.opencontainers.image.base.name=upstream ${UPSTREAM_TAG}" \
  -t "$IMAGE" .

arch=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")
if [ "$arch" != "linux/amd64" ]; then
  echo "FATAL: built ${arch}, production needs linux/amd64. Do not deploy." >&2
  exit 1
fi

echo "built: $IMAGE ($arch)"
echo "image id: $(docker image inspect --format '{{.Id}}' "$IMAGE")"
echo "source commit: $(git rev-parse --short HEAD)"
echo "not pushed. Next: stage 2 (staging) in ops/runbooks/04-release.md"
