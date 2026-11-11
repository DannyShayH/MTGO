#!/usr/bin/env bash
# Run only against a disposable database: migrations include the initial data seed.
set -euo pipefail

if [ "${1:-}" = "--browser" ] && [ "${APPLICATION_VERIFICATION_ISOLATED:-}" != "1" ]; then
  exec node scripts/verify-applications.mjs
fi

: "${DATABASE_URL:?Set DATABASE_URL to a disposable CI database}"
: "${NEXT_PUBLIC_MEDUSA_BACKEND_URL:?Set the local CI backend URL}"
: "${NEXT_PUBLIC_BASE_URL:?Set the CI storefront URL}"

if [ "${1:-}" = "--browser" ]; then
  export MEDUSA_CI_HTTP=1
fi

export NODE_ENV=production
build_tmp=$(mktemp -d)
backend_pid=""
storefront_pid=""
cleanup() {
  result=$?
  if [ -n "$storefront_pid" ]; then
    kill -- "-$storefront_pid" 2>/dev/null || true
    wait "$storefront_pid" 2>/dev/null || true
  fi
  if [ -n "$backend_pid" ]; then
    kill -- "-$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
  if [ "$result" -ne 0 ] && [ -f "$build_tmp/backend.log" ]; then
    cat "$build_tmp/backend.log"
    if [ -f "$build_tmp/storefront.log" ]; then cat "$build_tmp/storefront.log"; fi
  fi
  rm -rf "$build_tmp"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm run build -- --filter=@dtc/backend --force
(
  cd apps/backend
  npm exec medusa db:migrate
  npm exec medusa exec ./src/scripts/seed-demo-restaurant.ts
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

npm run build -- --filter=@dtc/storefront --force

if [ "${1:-}" = "--browser" ]; then
  export E2E_DISPOSABLE=1
  export E2E_ADMIN_EMAIL="smoke-$(node -p 'require("node:crypto").randomUUID()')@example.test"
  export E2E_ADMIN_PASSWORD="ci-only-browser-password"
  (
    cd apps/backend
    npm exec -- medusa user --email "$E2E_ADMIN_EMAIL" --password "$E2E_ADMIN_PASSWORD"
  )
  (
    cd apps/storefront
    exec setsid npm run start
  ) > "$build_tmp/storefront.log" 2>&1 &
  storefront_pid=$!
  curl --fail --silent --show-error --retry 60 --retry-connrefused \
    --retry-all-errors --retry-delay 2 --retry-max-time 120 --max-time 5 \
    "$NEXT_PUBLIC_BASE_URL/dk/store" > /dev/null
  (
    cd apps/storefront
    npm run test:e2e
  )
  timeout --signal=TERM --kill-after=5s 30s node scripts/verify-admin-development.mjs
fi
