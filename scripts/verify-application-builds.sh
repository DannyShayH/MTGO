#!/usr/bin/env bash
# Run only against a disposable database: migrations include the initial data seed.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable CI database}"
: "${NEXT_PUBLIC_MEDUSA_BACKEND_URL:?Set the local CI backend URL}"
: "${NEXT_PUBLIC_BASE_URL:?Set the CI storefront URL}"

export NODE_ENV=production
build_tmp=$(mktemp -d)
backend_pid=""
cleanup() {
  result=$?
  if [ -n "$backend_pid" ]; then
    kill -- "-$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
  if [ "$result" -ne 0 ] && [ -f "$build_tmp/backend.log" ]; then
    cat "$build_tmp/backend.log"
  fi
  rm -rf "$build_tmp"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm run build -- --filter=@dtc/backend
(
  cd apps/backend
  npm exec medusa db:migrate
  CI_PUBLISHABLE_KEY_FILE="$build_tmp/publishable-key" \
    npm exec medusa exec ./src/scripts/export-ci-publishable-key.ts
)

read -r NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY < "$build_tmp/publishable-key"
export NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

(
  cd apps/backend/.medusa/server
  exec setsid npm run start
) > "$build_tmp/backend.log" 2>&1 &
backend_pid=$!

curl --fail --silent --show-error --retry 60 --retry-connrefused \
  --retry-all-errors --retry-delay 2 --retry-max-time 120 --max-time 5 \
  "$NEXT_PUBLIC_MEDUSA_BACKEND_URL/health" > /dev/null
# Prove the seeded publishable key works before Next.js prerenders the sitemap.
curl --fail --silent --show-error --max-time 10 \
  -H "x-publishable-api-key: $NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" \
  "$NEXT_PUBLIC_MEDUSA_BACKEND_URL/store/regions" > /dev/null

npm run build -- --filter=@dtc/storefront
