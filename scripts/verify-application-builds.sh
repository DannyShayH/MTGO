#!/usr/bin/env bash
# Run only against a disposable database: migrations include the initial data seed.
set -euo pipefail

if [[ "${1:-}" = "--browser" ]] && [[ "${APPLICATION_VERIFICATION_ISOLATED:-}" != "1" ]]; then
  exec node scripts/verify-applications.mjs
fi

: "${DATABASE_URL:?Set DATABASE_URL to a disposable CI database}"
: "${NEXT_PUBLIC_MEDUSA_BACKEND_URL:?Set the local CI backend URL}"
: "${NEXT_PUBLIC_BASE_URL:?Set the CI storefront URL}"

if [[ "${1:-}" = "--browser" ]]; then
  export MEDUSA_CI_HTTP=1
fi

export NODE_ENV=production
build_tmp=$(mktemp -d)
backend_pid=""
storefront_pid=""
partner_pid=""
cleanup() {
  result=$?
  if [[ -n "$partner_pid" ]]; then
    kill -- "-$partner_pid" 2>/dev/null || true
    wait "$partner_pid" 2>/dev/null || true
  fi
  if [[ -n "$storefront_pid" ]]; then
    kill -- "-$storefront_pid" 2>/dev/null || true
    wait "$storefront_pid" 2>/dev/null || true
  fi
  if [[ -n "$backend_pid" ]]; then
    kill -- "-$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
  if [[ "$result" -ne 0 ]] && [[ -f "$build_tmp/backend.log" ]]; then
    cat "$build_tmp/backend.log"
    if [[ -f "$build_tmp/storefront.log" ]]; then cat "$build_tmp/storefront.log"; fi
    if [[ -f "$build_tmp/partner.log" ]]; then cat "$build_tmp/partner.log"; fi
  fi
  rm -rf "$build_tmp"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The seed makes this login authorized staff of the synthetic Restaurant, so the
# partner app smoke test can sign in (ADR-0017).
SEED_STAFF_EMAIL="partner-smoke-$(node -p 'require("node:crypto").randomUUID()')@example.test"
export SEED_STAFF_EMAIL
export SEED_STAFF_PASSWORD="ci-only-partner-password"

# Invite links copied in Admin point to the partner app started below.
export PARTNER_BASE_URL="${PARTNER_BASE_URL:-http://localhost:8100}"
export PARTNER_PUBLIC_URL="$PARTNER_BASE_URL"

npm run build -- --filter=@dtc/backend --force
(
  cd apps/backend
  npm exec --no -- medusa db:migrate
  npm exec --no -- medusa exec ./src/scripts/seed-demo-restaurant.ts
  CI_PUBLISHABLE_KEY_FILE="$build_tmp/publishable-key" \
    npm exec --no -- medusa exec ./src/scripts/export-ci-publishable-key.ts
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

# The partner app calls the backend only from its server side.
export MEDUSA_BACKEND_URL="$NEXT_PUBLIC_MEDUSA_BACKEND_URL"
npm run build -- --filter=@dtc/partner --force

if [[ "${1:-}" = "--browser" ]]; then
  export E2E_DISPOSABLE=1
  E2E_ADMIN_EMAIL="smoke-$(node -p 'require("node:crypto").randomUUID()')@example.test"
  export E2E_ADMIN_EMAIL
  export E2E_ADMIN_PASSWORD="ci-only-browser-password"
  (
    cd apps/backend
    npm exec --no -- medusa user --email "$E2E_ADMIN_EMAIL" --password "$E2E_ADMIN_PASSWORD"
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
  (
    cd apps/partner
    exec setsid npm run start
  ) > "$build_tmp/partner.log" 2>&1 &
  partner_pid=$!
  curl --fail --silent --show-error --retry 60 --retry-connrefused \
    --retry-all-errors --retry-delay 2 --retry-max-time 120 --max-time 5 \
    "$PARTNER_BASE_URL/sign-in" > /dev/null
  (
    cd apps/partner
    npm run test:e2e
  )
  timeout --signal=TERM --kill-after=5s 30s node scripts/verify-admin-development.mjs
fi
