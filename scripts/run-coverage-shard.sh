#!/usr/bin/env bash
set -u

# Keep the full output for the CI artifact; insitu embeds command output in
# the job summary, which GitHub limits to 1 MiB.
shard="$1"
log="../../tmp/coverage-shard-${shard}.log"
cd apps/backend || exit 1
mkdir -p ../../tmp
npm run test:coverage:shard -- "--shard=${shard}/3" > "$log" 2>&1
result=$?
tail -c 65536 "$log"
exit "$result"
