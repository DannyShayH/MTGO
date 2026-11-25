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
#   mtogo-deploy.sh monitoring up      Private request metrics (#194): turn on the
#       backend exporter and (re)start Prometheus and Grafana with the installed
#       configuration; the first time, install it from the current release.
#       Needs STAGING_METRICS_ENABLED=1. STAGING_LOGS_ENABLED=1 also starts Loki
#       and Alloy (#176). Deploys and rollback never change either (#180).
#   mtogo-deploy.sh monitoring update [<sha>]  Install deploy/monitoring/ from
#       that release (default: current), check it, then do what up does.
#   mtogo-deploy.sh monitoring down    Stop the monitoring stack; history is kept.
#   mtogo-deploy.sh monitoring status  Monitoring containers and their source release.
#   mtogo-deploy.sh monitoring viewer-add <login>     Grafana Viewer, prints its first password.
#   mtogo-deploy.sh monitoring viewer-remove <login>  Delete that Grafana account.
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
readonly MONITORING_DIR=/srv/mtogo-monitoring
readonly MONITORING_PATH_IN_IMAGE=/app/deploy/monitoring
readonly GRAFANA_ADMIN_USER=staging-admin

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

# Prometheus and Grafana: a separate Compose project, never touched by
# prepare, release or rollback (deploy/monitoring/compose.staging.yaml).
# STAGING_LOGS_ENABLED=1 adds Loki and Alloy (the `logs` profile, #176).
logs_enabled() {
  [[ "$(env_optional STAGING_LOGS_ENABLED)" == "1" ]]
}

# docker compose for the monitoring folder given (the installed one by default).
monitoring_compose() {
  local dir="$MONITORING_DIR/config" profiles=""
  if [[ "${1:-}" == /* ]]; then
    dir=$1
    shift
  fi
  logs_enabled && profiles=logs
  COMPOSE_PROFILES=$profiles \
    docker compose --project-name mtogo-staging-monitoring \
    --project-directory "$dir" \
    --env-file "$ENV_FILE" \
    --file "$dir/compose.staging.yaml" "$@"
}

monitoring_installed() { [[ -f "$MONITORING_DIR/config/compose.staging.yaml" ]]; }

check_monitoring_env() {
  [[ "$(env_optional STAGING_METRICS_ENABLED)" == "1" ]] ||
    die "set STAGING_METRICS_ENABLED=1 in $ENV_FILE first"
  env_value STAGING_GRAFANA_URL > /dev/null
  [[ "$(env_value GRAFANA_ADMIN_PASSWORD)" =~ ^[A-Za-z0-9]{24,}$ ]] ||
    die "GRAFANA_ADMIN_PASSWORD must be at least 24 letters and digits (openssl rand -hex 24)"
}

# Checks a monitoring folder with the pinned tools before it is used. Each
# step returns explicitly: called left of ||, set -e does not apply inside.
check_monitoring_config() {
  local dir=$1
  monitoring_compose "$dir" config --quiet || return 1
  monitoring_compose "$dir" run --rm --no-deps --entrypoint /bin/promtool \
    prometheus check config /etc/prometheus/prometheus.yaml > /dev/null || return 1
  if logs_enabled; then
    monitoring_compose "$dir" run --rm --no-deps loki \
      -config.file=/etc/loki/config.yaml -verify-config > /dev/null || return 1
  fi
}

# The monitoring files of the given release, checked and then swapped in as one
# folder (#180). They live outside the release folders, so pruning, deploys and
# rollback never change them; a failed check leaves the installed folder as it
# was. The old folder stays until the next swap, for a manual rollback of
# monitoring itself.
install_monitoring_config() {
  local sha=$1 new="$MONITORING_DIR/config.new"
  install -d -o root -g root -m 755 "$MONITORING_DIR"
  rm -rf -- "$new"
  install -d -o root -g root -m 755 "$new"
  pull_image "$(image_prefix)-backend:$sha"
  docker run --rm --entrypoint tar "$(image_prefix)-backend:$sha" \
    -C "$MONITORING_PATH_IN_IMAGE" -cf - . | tar -xf - --no-same-owner -C "$new"
  [[ -f "$new/compose.staging.yaml" ]] ||
    die "release $sha has no staging monitoring (deliver #194 first); the installed configuration is unchanged"
  printf '%s\n' "$sha" > "$new/SOURCE_RELEASE"
  check_monitoring_config "$new" ||
    die "the monitoring configuration of $sha failed its check; the installed configuration is unchanged"
  rm -rf -- "$MONITORING_DIR/config.old"
  if [[ -d "$MONITORING_DIR/config" ]]; then
    mv -- "$MONITORING_DIR/config" "$MONITORING_DIR/config.old"
  fi
  mv -- "$new" "$MONITORING_DIR/config"
}

# Grafana's HTTP API on its published port, as the staging admin. The
# credentials and the body travel through file descriptors, never through
# the process list.
grafana_api() {
  local method=$1 path=$2 body=${3:-} address port url
  address=$(env_optional STAGING_BIND_ADDRESS)
  port=$(env_optional STAGING_GRAFANA_PORT)
  url="http://${address:-127.0.0.1}:${port:-3300}$path"
  local args=(--silent --show-error --fail -X "$method" -H "content-type: application/json")
  if [[ -n "$body" ]]; then
    curl "${args[@]}" \
      -K <(printf 'user = "%s:%s"\n' "$GRAFANA_ADMIN_USER" "$(env_value GRAFANA_ADMIN_PASSWORD)") \
      --data-binary @<(printf '%s' "$body") "$url"
  else
    curl "${args[@]}" \
      -K <(printf 'user = "%s:%s"\n' "$GRAFANA_ADMIN_USER" "$(env_value GRAFANA_ADMIN_PASSWORD)") "$url"
  fi
}

require_viewer_login() {
  [[ "${1:-}" =~ ^[a-z0-9][a-z0-9._-]{1,39}$ ]] ||
    die "a login of 2-40 lower-case letters, digits, dots, dashes or underscores is required"
  [[ "$1" != "$GRAFANA_ADMIN_USER" ]] || die "$GRAFANA_ADMIN_USER is not a Viewer"
}

cmd_monitoring() {
  local action=${1:-status}
  shift || true
  check_env_file
  case "$action" in
    up | update)
      local sha config_sha
      sha=$(current_release)
      config_sha=${1:-$sha}
      if [[ "$action" == up ]]; then
        [[ $# -eq 0 ]] || die "monitoring up takes no arguments (to install another release's configuration: monitoring update <sha>)"
      else
        [[ $# -le 1 ]] || die "monitoring update takes at most one release SHA"
        require_sha "$config_sha"
      fi
      check_monitoring_env
      take_lock
      # Creates the internal scrape network and applies the exporter setting;
      # recreates the backend only when its configuration changed. A release
      # from before #194 has no exporter: its target stays DOWN.
      log "applying the exporter setting to the backend"
      compose "$sha" up -d --wait backend
      if [[ "$action" == update ]] || ! monitoring_installed; then
        log "installing the monitoring configuration of $config_sha"
        install_monitoring_config "$config_sha"
      else
        # The configuration stays the installed one, whatever release runs now.
        log "using the installed monitoring configuration of $(cat "$MONITORING_DIR/config/SOURCE_RELEASE")"
        check_monitoring_config "$MONITORING_DIR/config"
      fi
      if logs_enabled; then
        log "starting Prometheus, Grafana, Loki and Alloy"
      else
        log "starting Prometheus and Grafana"
      fi
      monitoring_compose up -d --wait --force-recreate
      monitoring_compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Image}}'
      ;;
    down)
      [[ $# -eq 0 ]] || die "monitoring down takes no arguments"
      monitoring_installed || die "monitoring is not installed"
      # Includes Loki and Alloy even after STAGING_LOGS_ENABLED was set to 0.
      monitoring_compose --profile logs down
      log "stopped; history and accounts are kept. Set STAGING_METRICS_ENABLED=0 to turn the exporter off at the next deploy"
      ;;
    status)
      monitoring_installed || die "monitoring is not installed"
      printf 'monitoring configuration from release: %s\n' "$(cat "$MONITORING_DIR/config/SOURCE_RELEASE")"
      monitoring_compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Image}}'
      ;;
    viewer-add)
      require_viewer_login "${1:-}"
      [[ $# -eq 1 ]] || die "monitoring viewer-add takes one login"
      check_monitoring_env
      local login=$1 password
      password=$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')
      grafana_api POST /api/admin/users \
        "{\"name\":\"$login\",\"login\":\"$login\",\"password\":\"$password\"}" > /dev/null ||
        die "Grafana refused the new account (does $login already exist?)"
      printf 'Viewer %s created. First password, shown once; hand it over through the password manager:\n%s\n' \
        "$login" "$password"
      ;;
    viewer-remove)
      require_viewer_login "${1:-}"
      [[ $# -eq 1 ]] || die "monitoring viewer-remove takes one login"
      check_monitoring_env
      local id
      id=$(grafana_api GET "/api/users/lookup?loginOrEmail=$1" | grep -oE '"id":[0-9]+' | head -n 1 | cut -d: -f2) ||
        die "no Grafana account $1"
      [[ -n "$id" ]] || die "no Grafana account $1"
      grafana_api DELETE "/api/admin/users/$id" > /dev/null
      log "removed Grafana account $1"
      ;;
    *) die "unknown monitoring action: $action (up, update, down, status, viewer-add, viewer-remove)" ;;
  esac
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
    monitoring) cmd_monitoring "$@" ;;
    help | --help | -h) sed -n '2,46p' "$0" ;;
    *) die "unknown command: $command (try: help)" ;;
  esac
}

main "$@"
