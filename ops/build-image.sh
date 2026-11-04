#!/bin/sh
# CUSTOM(brand): reproducible local build of the Bozzii image.
#
# Mirrors upstream's release workflow, which writes the git tag into VERSION
# before docker build (.github/workflows/docker-build.yml). The Dockerfile reads
# VERSION for the frontend build stamp and the Go -ldflags version.
#
# Usage: sh ops/build-image.sh <upstream-tag> <bozzii-build-number>
#   e.g. sh ops/build-image.sh v1.0.0-rc.48 1
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

trap 'git checkout -- VERSION' EXIT
printf '%s\n' "$IMAGE_TAG" > VERSION

docker build \
  --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
  --label "org.opencontainers.image.version=${IMAGE_TAG}" \
  --label "org.opencontainers.image.base.name=upstream ${UPSTREAM_TAG}" \
  -t "$IMAGE" .

echo "built: $IMAGE"
echo "image id: $(docker image inspect --format '{{.Id}}' "$IMAGE")"
echo "source commit: $(git rev-parse --short HEAD)"
echo "not pushed. Next: stage 2 (staging) in ops/runbooks/04-release.md"
