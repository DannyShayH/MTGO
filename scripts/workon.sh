#!/usr/bin/env bash
# Wrapper around `gh tt workon` that also records when work on an issue started.
#
# gh tt workon moves the issue to "In Progress". GitHub records the timestamp of
# that status change for elapsed-time reporting. Calendar-day cycle time also
# needs a start date, so this script sets the project's "Start date" field to
# today, but only when it is still empty. Re-running workon never moves the date.
#
# Usage: gh workon -i <issue-number>   (the gh alias points here, see .insitu.yml)
set -euo pipefail

START_FIELD="Start date"

gh tt workon "$@"

# gh tt workon names the branch "<issue-number>-<title>"
issue=$(git rev-parse --abbrev-ref HEAD | grep -oE '^[0-9]+' || true)
if [ -z "$issue" ]; then
  echo "workon: not on an issue branch, start date not set"
  exit 0
fi

config="$(git rev-parse --show-toplevel)/.tt-config.json"
owner=$(node -p "require('$config').project.owner")
number=$(node -p "require('$config').project.number")

item_id=$(gh project item-list "$number" --owner "$owner" --format json --limit 1000 \
  --jq ".items[] | select(.content.number == $issue) | .id")
if [ -z "$item_id" ]; then
  echo "workon: issue #$issue is not on project $owner/$number, start date not set"
  exit 0
fi

current=$(gh project item-list "$number" --owner "$owner" --format json --limit 1000 \
  --jq ".items[] | select(.content.number == $issue) | .\"start date\" // empty")
if [ -n "$current" ]; then
  echo "workon: issue #$issue already started on $current, start date kept"
  exit 0
fi

project_id=$(gh project view "$number" --owner "$owner" --format json --jq .id)
field_id=$(gh project field-list "$number" --owner "$owner" --format json \
  --jq ".fields[] | select(.name == \"$START_FIELD\") | .id")
if [ -z "$field_id" ]; then
  echo "workon: field \"$START_FIELD\" not found on project $owner/$number, start date not set"
  exit 0
fi

today=$(date +%F)
gh project item-edit --project-id "$project_id" --id "$item_id" --field-id "$field_id" --date "$today" > /dev/null
echo "workon: start date for issue #$issue set to $today"
