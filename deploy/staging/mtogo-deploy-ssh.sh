#!/usr/bin/env bash
# Forced SSH command for the CI deploy key on the staging Droplet.
#
# Install as /usr/local/sbin/mtogo-deploy-ssh (owner root, mode 755) and force
# it on the GitHub Actions key in ~deploy/.ssh/authorized_keys:
#   restrict,command="/usr/local/sbin/mtogo-deploy-ssh" ssh-ed25519 AAAA... mtogo-staging-ci
#
# It runs as the deploy user, never opens a shell, and accepts only these
# requests from the Deploy workflow (.github/workflows/on_main.yml):
#   prepare <sha> [--ghcr-user <name>]
#   release <sha> [--ghcr-user <name>]
#   deploy  <sha> [--ghcr-user <name>]
#   status
# Each accepted request runs /usr/local/sbin/mtogo-deploy.sh through the sudo
# rule in deploy/staging/sudoers.example. Standard input (the one-off GHCR
# token) passes through unchanged.
set -euo pipefail

client=${SSH_CLIENT:-unknown}
client=${client%% *}

reject() {
  printf '[mtogo-deploy-ssh] rejected: %s\n' "$1" >&2
  /usr/bin/logger -t mtogo-deploy-ssh "rejected request from $client: $1" 2> /dev/null || true
  exit 64
}

request=${SSH_ORIGINAL_COMMAND:-}
[[ -n "$request" ]] || reject "no command (interactive sessions are not allowed)"
[[ ${#request} -le 200 ]] || reject "command too long"
# Words of letters, digits, '-', '[' and ']' separated by single spaces: no
# quoting, globbing or shell syntax can reach the next step.
allowed='^[][A-Za-z0-9 -]+$'
[[ "$request" =~ $allowed ]] || reject "unexpected characters"

read -r -a words <<< "$request"
command=${words[0]}
args=()

case "$command" in
  status)
    [[ ${#words[@]} -eq 1 ]] || reject "status takes no arguments"
    ;;
  prepare | release | deploy)
    [[ "${words[1]:-}" =~ ^[0-9a-f]{40}$ ]] || reject "$command needs a full commit SHA"
    args=("${words[1]}")
    case ${#words[@]} in
      2) ;;
      4)
        [[ "${words[2]}" == "--ghcr-user" && "${words[3]}" =~ ^[A-Za-z0-9-]{1,39}(\[bot\])?$ ]] ||
          reject "only --ghcr-user <name> may follow the SHA"
        args+=("${words[2]}" "${words[3]}")
        ;;
      *) reject "unexpected arguments" ;;
    esac
    ;;
  *) reject "unknown command '$command'" ;;
esac

/usr/bin/logger -t mtogo-deploy-ssh "accepted ${command} ${args[0]:-} from $client" 2> /dev/null || true
# Absolute paths: the command never depends on the session's PATH.
exec /usr/bin/sudo -n /usr/local/sbin/mtogo-deploy.sh "$command" "${args[@]}"
