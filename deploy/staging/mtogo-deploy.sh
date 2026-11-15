#!/usr/bin/env bash
# MTOGO staging release control for the DigitalOcean Droplet.
#
# Install as /usr/local/sbin/mtogo-deploy.sh (owner root, mode 755). The CI
# deploy user reaches only prepare, release, deploy and status: its SSH key is
# forced to /usr/local/sbin/mtogo-deploy-ssh (deploy/staging/mtogo-deploy-ssh.sh),
# which calls this script through the sudo rule in deploy/staging/sudoers.example.
# Administrators run every command with sudo.
#
# Root owns everything under /srv/mtogo-staging, because this script runs as
# root and executes what it finds there: .env (secrets, mode 600),
# releases/<sha>/ (the Compose file extracted from that release's backend
# image), releases/current and releases/previous (release identity) and
# backups/ (pg_dump before migrations).
#
# Usage:
#   mtogo-deploy.sh prepare <sha> [--ghcr-user <name>] [--skip-migrations]
#       Pull backend and partner images, back up the database, migrate, start
#       the backend (and worker) and the partner app, print the storefront
#       build values.
#   mtogo-deploy.sh release <sha> [--ghcr-user <name>]
#       Pull the storefront image, start it, record the release.
#   mtogo-deploy.sh deploy <sha> [--ghcr-user <name>] [--skip-migrations]
#       prepare + release for images that already exist (manual redeploy).
#   mtogo-deploy.sh rollback          Redeploy releases/previous without migrations.
#   mtogo-deploy.sh status            Current and previous release, container health.
#   mtogo-deploy.sh backup            pg_dump of the staging database.
#   mtogo-deploy.sh restore <file> --yes   Stop the apps, restore a dump, start again.
#   mtogo-deploy.sh logs [args...]    docker compose logs (default: last 10 minutes).
#   mtogo-deploy.sh seed              Run the synthetic Restaurant and menu seeds once.
#   mtogo-deploy.sh psql [args...]    psql as the restricted staging database user.
#   mtogo-deploy.sh compose [args...] Any docker compose command for the current release.
#
# A GHCR token may be passed on the first line of stdin for private packages;
# it is used for one Docker login in a temporary config and then discarded.
set -euo pipefail

readonly STAGING_DIR=/srv/mtogo-staging
readonly ENV_FILE="$STAGING_DIR/.env"
readonly RELEASES_DIR="$STAGING_DIR/releases"
readonly BACKUPS_DIR="$STAGING_DIR/backups"
readonly LOCK_FILE="$STAGING_DIR/.deploy.lock"
readonly BACKUPS_TO_KEEP=10
readonly COMPOSE_PATH_IN_IMAGE=/app/deploy/staging/compose.yaml
readonly APP_SERVICES_WITHOUT_WORKER=(backend partner storefront)

log() { printf '[mtogo-deploy] %s\n' "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "run as root (through sudo)"
}

# The sudo rule's argument wildcards also match arguments the SSH gate never
# sends. A caller who reached root through sudo without being an administrator
# (member of the sudo group) gets exactly the gate's grammar, enforced here:
# prepare|release|deploy <sha> [--ghcr-user <name>] and status.
CI_CALLER=0
classify_caller() {
  local caller=${SUDO_USER:-root}
  [[ "$caller" == "root" ]] && return 0
  id -nG -- "$caller" 2> /dev/null | tr ' ' '\n' | grep -qx sudo && return 0
  CI_CALLER=1
}

require_ci_command() {
  [[ "$CI_CALLER" -eq 1 ]] || return 0
  case "$1" in
    prepare | release | deploy | status) ;;
    *) die "$1 is for administrators only" ;;
  esac
}

require_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || die "a full 40-character commit SHA is required"
}

# Root executes files from the staging directory, so nobody else may write it.
check_staging_dir() {
  [[ -d "$STAGING_DIR" ]] || die "$STAGING_DIR is missing"
  local owner mode
  owner=$(stat -c '%U' "$STAGING_DIR")
  mode=$(stat -c '%a' "$STAGING_DIR")
  [[ "$owner" == "root" ]] ||
    die "$STAGING_DIR must be owned by root (is $owner); see the staging runbook, server setup"
  (((8#$mode & 8#022) == 0)) ||
    die "$STAGING_DIR must not be writable by group or others (mode $mode)"
}

# Reads one plain KEY=VALUE from .env without sourcing it.
env_value() {
  local value
  value=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  [[ -n "$value" ]] || die "$1 is missing in $ENV_FILE"
  printf '%s' "$value"
}

env_optional() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

check_env_file() {
  check_staging_dir
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE is missing (see deploy/staging/.env.template)"
  local mode owner
  mode=$(stat -c '%a' "$ENV_FILE")
  owner=$(stat -c '%U' "$ENV_FILE")
  [[ "$owner" == "root" && "$mode" == "600" ]] ||
    die "$ENV_FILE must be owned by root with mode 600 (is $owner, $mode)"
  for name in STAGING_STOREFRONT_URL STAGING_BACKEND_URL STAGING_PARTNER_URL \
    STAGING_IMAGE_PREFIX STAGING_DB_NETWORK STAGING_DB_NAME STAGING_DB_USER \
    STAGING_DB_PASSWORD JWT_SECRET COOKIE_SECRET; do
    env_value "$name" > /dev/null
  done
  [[ "$(env_value STAGING_DB_PASSWORD)" =~ ^[A-Za-z0-9]+$ ]] ||
    die "STAGING_DB_PASSWORD must contain letters and digits only"
  [[ "$(env_value STAGING_DB_NAME)" == mtogo_staging* ]] ||
    die "STAGING_DB_NAME must start with mtogo_staging"
  docker network inspect "$(env_value STAGING_DB_NETWORK)" > /dev/null 2>&1 ||
    die "Docker network $(env_value STAGING_DB_NETWORK) (STAGING_DB_NETWORK) does not exist"
}

split_worker() { [[ "$(env_optional STAGING_SPLIT_WORKER)" == "true" ]]; }

app_services() {
  if split_worker; then
    printf '%s\n' backend worker partner storefront
  else
    printf '%s\n' "${APP_SERVICES_WITHOUT_WORKER[@]}"
  fi
}

LOCK_HELD=0
take_lock() {
  [[ "$LOCK_HELD" -eq 1 ]] && return 0
  exec 9> "$LOCK_FILE"
  flock -n 9 || die "another deployment is running (lock: $LOCK_FILE)"
  LOCK_HELD=1
}

# One Docker login in a throwaway config. The token never touches the disk
# outside that directory, which is removed on exit.
DOCKER_CONFIG_TMP=""
cleanup() {
  if [[ -n "$DOCKER_CONFIG_TMP" ]]; then
    rm -rf -- "$DOCKER_CONFIG_TMP"
  fi
}
trap cleanup EXIT

registry_login() {
  local user=${1:-github-actions} token=""
  if [[ ! -t 0 ]]; then
    IFS= read -r -t 10 token || true
  fi
  [[ -n "$token" ]] || return 0
  DOCKER_CONFIG_TMP=$(mktemp -d /run/mtogo-deploy.XXXXXX)
  export DOCKER_CONFIG="$DOCKER_CONFIG_TMP"
  printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin > /dev/null
  log "logged in to ghcr.io for this run"
}

image_prefix() { env_value STAGING_IMAGE_PREFIX; }

release_dir() { printf '%s/%s' "$RELEASES_DIR" "$1"; }

current_release() {
  [[ -f "$RELEASES_DIR/current" ]] || die "no release deployed yet"
  cat "$RELEASES_DIR/current"
}

# docker compose for one release: .env plus that release's Compose file. The
# worker profile and the backend's worker mode follow STAGING_SPLIT_WORKER.
compose() {
  local sha=$1 mode=shared profiles=""
  shift
  if split_worker; then
    mode=server
    profiles=worker
  fi
  STAGING_BACKEND_MODE=$mode COMPOSE_PROFILES=$profiles \
    docker compose --project-name mtogo-staging \
    --project-directory "$STAGING_DIR" \
    --env-file "$ENV_FILE" \
    --env-file "$(release_dir "$sha")/release.env" \
    --file "$(release_dir "$sha")/compose.yaml" "$@"
}

# A local copy is enough: rollback and redeploy work without the registry.
pull_image() {
  if docker image inspect "$1" > /dev/null 2>&1; then
    log "using local $1"
    return 0
  fi
  log "pulling $1"
  docker pull --quiet "$1" > /dev/null ||
    die "cannot pull $1 (not built, or the package is private and no token was given)"
}

# Extract the Compose file of this release from its backend image, so the
# runtime definition always matches the delivered commit.
materialize_release() {
  local sha=$1 dir
  dir=$(release_dir "$sha")
  install -d -m 700 "$RELEASES_DIR" "$dir"
  docker run --rm --entrypoint cat "$(image_prefix)-backend:$sha" \
    "$COMPOSE_PATH_IN_IMAGE" > "$dir/compose.yaml.tmp"
  mv "$dir/compose.yaml.tmp" "$dir/compose.yaml"
  printf 'MTOGO_RELEASE=%s\n' "$sha" > "$dir/release.env"
  chmod 600 "$dir/compose.yaml" "$dir/release.env"
}

# PostgreSQL client tools as the restricted staging user, on the db network.
dbtools() {
  local sha=$1
  shift
  compose "$sha" run --rm -T --no-deps dbtools "$@"
}

wait_for_database() {
  local sha=$1 attempt
  for attempt in $(seq 1 30); do
    if dbtools "$sha" pg_isready --quiet > /dev/null 2>&1; then
      return 0
    fi
    log "waiting for PostgreSQL ($attempt/30)"
    sleep 2
  done
  die "PostgreSQL at $(env_optional STAGING_DB_HOST):$(env_optional STAGING_DB_PORT) on network $(env_value STAGING_DB_NETWORK) is not reachable"
}

database_backup() {
  local sha=$1 name
  install -d -m 700 "$BACKUPS_DIR"
  name="$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}.dump"
  log "backing up the database to $BACKUPS_DIR/$name"
  # Written inside the backups folder, so the dump is a seekable file that
  # pg_restore can filter (see cmd_restore).
  dbtools "$sha" pg_dump --format=custom --no-owner --file "/backups/$name" || {
    rm -f -- "${BACKUPS_DIR:?}/$name"
    die "database backup failed; nothing was migrated"
  }
  chmod 600 "$BACKUPS_DIR/$name"
  # Keep the newest BACKUPS_TO_KEEP dumps.
  find "$BACKUPS_DIR" -maxdepth 1 -name '*.dump' -printf '%T@ %p\n' |
    sort -rn | tail -n "+$((BACKUPS_TO_KEEP + 1))" | cut -d' ' -f2- |
    while IFS= read -r old; do
      log "removing old backup $old"
      rm -f -- "$old"
    done
  printf '%s' "$BACKUPS_DIR/$name"
}

publishable_key() {
  local sha=$1 key
  key=$(dbtools "$sha" psql -tA -c \
    "select token from api_key where type = 'publishable' and revoked_at is null and title = 'Default Publishable API Key' order by created_at limit 1")
  [[ "$key" =~ ^pk_[A-Za-z0-9]+$ ]] || die "no publishable key from the initial seed in the database"
  printf '%s' "$key"
}

print_storefront_build_values() {
  local sha=$1
  cat << EOF
-----BEGIN MTOGO STOREFRONT BUILD-----
NEXT_PUBLIC_MEDUSA_BACKEND_URL=$(env_value STAGING_BACKEND_URL)
NEXT_PUBLIC_BASE_URL=$(env_value STAGING_STOREFRONT_URL)
NEXT_PUBLIC_DEFAULT_REGION=$(env_optional STAGING_DEFAULT_REGION)
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$(publishable_key "$sha")
-----END MTOGO STOREFRONT BUILD-----
EOF
}

parse_options() {
  GHCR_USER="github-actions"
  SKIP_MIGRATIONS=0
  CONFIRMED=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ghcr-user)
        [[ "${2:-}" =~ ^[A-Za-z0-9-]{1,39}(\[bot\])?$ ]] || die "--ghcr-user needs a GitHub user name"
        GHCR_USER=$2
        shift 2
        ;;
      --skip-migrations)
        [[ "$CI_CALLER" -eq 0 ]] || die "--skip-migrations is for administrators only"
        SKIP_MIGRATIONS=1
        shift
        ;;
      --yes)
        [[ "$CI_CALLER" -eq 0 ]] || die "--yes is for administrators only"
        CONFIRMED=1
        shift
        ;;
      *) die "unknown option: $1" ;;
    esac
  done
}

cmd_prepare() {
  local sha=$1
  shift
  require_sha "$sha"
  parse_options "$@"
  check_env_file
  take_lock
  registry_login "$GHCR_USER"
  local prefix
  prefix=$(image_prefix)
  pull_image "$prefix-backend:$sha"
  pull_image "$prefix-partner:$sha"
  materialize_release "$sha"
  log "starting Redis"
  compose "$sha" up -d --wait redis
  wait_for_database "$sha"
  if [[ -f "$RELEASES_DIR/current" ]]; then
    database_backup "$sha" > /dev/null
  else
    log "first release: no staging data to back up yet"
  fi
  if [[ "$SKIP_MIGRATIONS" -eq 1 ]]; then
    log "skipping migrations as requested"
  else
    log "running migrations for $sha"
    compose "$sha" run --rm migrate
  fi
  local services=(backend partner)
  if split_worker; then
    services=(backend worker partner)
  else
    # Leaving split mode: a worker from an earlier release must not keep running.
    compose "$sha" rm --stop --force worker > /dev/null 2>&1 || true
  fi
  log "starting ${services[*]} for $sha"
  compose "$sha" up -d --wait --remove-orphans "${services[@]}"
  print_storefront_build_values "$sha"
}

record_release() {
  local sha=$1 previous=""
  if [[ -f "$RELEASES_DIR/current" ]]; then
    previous=$(cat "$RELEASES_DIR/current")
  fi
  if [[ -n "$previous" && "$previous" != "$sha" ]]; then
    printf '%s\n' "$previous" > "$RELEASES_DIR/previous"
  fi
  printf '%s\n' "$sha" > "$RELEASES_DIR/current"
  prune_releases
}

# Keep the images and release folders of the current and previous release.
prune_releases() {
  local keep=() prefix dir sha
  prefix=$(image_prefix)
  for name in current previous; do
    [[ -f "$RELEASES_DIR/$name" ]] && keep+=("$(cat "$RELEASES_DIR/$name")")
  done
  for dir in "$RELEASES_DIR"/*/; do
    [[ -d "$dir" ]] || continue
    sha=$(basename "$dir")
    [[ " ${keep[*]} " == *" $sha "* ]] && continue
    rm -rf -- "${RELEASES_DIR:?}/$sha"
  done
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -F "$prefix-" |
    while IFS= read -r image; do
      sha=${image##*:}
      [[ " ${keep[*]} " == *" $sha "* ]] && continue
      docker image rm "$image" > /dev/null 2>&1 || true
    done
}

cmd_release() {
  local sha=$1
  shift
  require_sha "$sha"
  parse_options "$@"
  check_env_file
  take_lock
  [[ -f "$(release_dir "$sha")/compose.yaml" ]] || die "run prepare $sha first"
  registry_login "$GHCR_USER"
  pull_image "$(image_prefix)-storefront:$sha"
  log "starting the storefront for $sha"
  compose "$sha" up -d --wait storefront
  record_release "$sha"
  log "release $sha is live"
  cmd_status
}

cmd_deploy() {
  local sha=$1
  shift
  # One lock for both phases: no other run can start in between.
  cmd_prepare "$sha" "$@" > /dev/null
  cmd_release "$sha" "$@"
}

cmd_rollback() {
  check_env_file
  [[ -f "$RELEASES_DIR/previous" ]] || die "no previous release recorded"
  local previous
  previous=$(cat "$RELEASES_DIR/previous")
  log "rolling back to $previous (database migrations are not reversed)"
  cmd_deploy "$previous" --skip-migrations "$@"
}

cmd_status() {
  [[ $# -eq 0 ]] || die "status takes no arguments"
  check_staging_dir
  local current="" previous=""
  [[ -f "$RELEASES_DIR/current" ]] && current=$(cat "$RELEASES_DIR/current")
  [[ -f "$RELEASES_DIR/previous" ]] && previous=$(cat "$RELEASES_DIR/previous")
  printf 'current release:  %s\nprevious release: %s\n' "${current:-none}" "${previous:-none}"
  [[ -n "$current" ]] || return 0
  compose "$current" ps --format 'table {{.Service}}\t{{.Status}}\t{{.Image}}'
}

cmd_backup() {
  check_env_file
  take_lock
  database_backup "$(current_release)"
  printf '\n'
}

cmd_restore() {
  local file=${1:-}
  shift || true
  parse_options "$@"
  [[ -f "$file" ]] || die "dump file not found: $file"
  [[ "$(realpath "$file")" == "$BACKUPS_DIR"/* ]] ||
    die "copy the dump into $BACKUPS_DIR first (owner root, mode 600)"
  [[ "$CONFIRMED" -eq 1 ]] || die "restore replaces the staging database: add --yes"
  check_env_file
  take_lock
  local sha services name
  sha=$(current_release)
  name=$(realpath --relative-to="$BACKUPS_DIR" "$file")
  mapfile -t services < <(app_services)
  log "stopping ${services[*]}"
  compose "$sha" stop "${services[@]}"
  log "restoring $file into $(env_value STAGING_DB_NAME)"
  # The extensions belong to the database superuser, who created them; the
  # restricted owner can neither drop nor recreate them, so they are skipped.
  # shellcheck disable=SC2016 # expanded by the container's shell
  dbtools "$sha" sh -ec '
    pg_restore --list "$1" | grep -v " EXTENSION " > /tmp/restore.list
    pg_restore --use-list /tmp/restore.list --clean --if-exists --no-owner \
      --exit-on-error --dbname "$PGDATABASE" "$1"
  ' restore "/backups/$name"
  log "starting ${services[*]}"
  compose "$sha" up -d --wait "${services[@]}"
  cmd_status
}

cmd_logs() {
  local sha
  sha=$(current_release)
  if [[ $# -eq 0 ]]; then
    compose "$sha" logs --since=10m --timestamps
  else
    compose "$sha" logs "$@"
  fi
}

cmd_seed() {
  check_env_file
  take_lock
  local sha
  sha=$(current_release)
  log "seeding the synthetic Restaurant and menu (idempotent)"
  compose "$sha" run --rm migrate npm exec --no -- medusa exec ./src/scripts/seed-demo-restaurant.js
  compose "$sha" run --rm migrate npm exec --no -- medusa exec ./src/scripts/seed-demo-menu.js
}

cmd_psql() {
  check_env_file
  local sha
  sha=$(current_release)
  if [[ -t 0 ]]; then
    compose "$sha" run --rm --no-deps dbtools psql "$@"
  else
    dbtools "$sha" psql "$@"
  fi
}

cmd_compose() {
  compose "$(current_release)" "$@"
}

main() {
  require_root
  classify_caller
  local command=${1:-help}
  shift || true
  require_ci_command "$command"
  case "$command" in
    prepare) cmd_prepare "$@" ;;
    release) cmd_release "$@" ;;
    deploy) cmd_deploy "$@" ;;
    rollback) cmd_rollback "$@" ;;
    status) cmd_status "$@" ;;
    backup) cmd_backup ;;
    restore) cmd_restore "$@" ;;
    logs) cmd_logs "$@" ;;
    seed) cmd_seed ;;
    psql) cmd_psql "$@" ;;
    compose) cmd_compose "$@" ;;
    help | --help | -h) sed -n '2,37p' "$0" ;;
    *) die "unknown command: $command (try: help)" ;;
  esac
}

main "$@"
