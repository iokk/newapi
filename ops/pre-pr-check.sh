#!/usr/bin/env bash
# Bozzii pre-PR gate: catches route-invariant breaks, frontend lint/type errors,
# stale VERSION / retired model names, and accidental secret leaks before push.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/6] Checking VERSION file stays empty (upstream builds inject via ldflags)"
if [ -s VERSION ]; then
  echo "FAIL: VERSION is non-empty ($(cat VERSION)); clear it so upstream merges stay conflict-free."
  exit 1
fi

echo "==> [2/6] Checking web/public/brand/ has no retired flagship model names"
if grep -rnE 'gpt-4o|deepseek-v3|claude-3-5|gemini-2\.0' web/public/brand/ 2>/dev/null; then
  echo "FAIL: Retired model reference found in web/public/brand/."
  exit 1
fi

echo "==> [3/6] Checking staged/working diff for accidental secret leaks"
if git diff origin/main...HEAD -- ':!ops/pre-pr-check.sh' | grep -nE '^\+.*(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)' 2>/dev/null; then
  echo "FAIL: Potential secret detected in diff."
  exit 1
fi

echo "==> [4/6] Running Go route-invariant & Epay/Auth tests"
go test ./pkg/jsplugin/... ./router/...
go test ./controller -run 'TestGetSubscriptionEpayPayMoney|TestSubscriptionEpayEndToEnd|TestEpay|TestSession|TestAuth'

echo "==> [5/6] Running frontend typecheck + branding oxlint"
(
  cd web
  if bun check --help >/dev/null 2>&1; then
    bun run typecheck
  else
    echo "WARN: local bun ($(bun --version)) lacks 'bun check' (requires bun >= 1.4.4); relying on CI for typecheck."
  fi
  bunx oxlint -c .oxlintrc.json src/branding/
)

echo "==> [6/6] Running full frontend Vitest suite"
(
  cd web
  bun run test
)

echo "PASS: All Bozzii pre-PR checks succeeded."
