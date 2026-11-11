# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in [DannyShayH/MTGO](https://github.com/DannyShayH/MTGO). Use the `gh` CLI for all operations. The [TakT workflow rules in AGENTS.md](../../AGENTS.md#workflow-takt--kanban) take precedence over anything in this file.

## Status and labels (TakT)

- **Issue status lives on the GitHub Project board**, not in labels. The columns are Backlog, Ready, In Progress, Delivery Initiated and Done. The developer owns the board: never move board items or edit board fields.
- **Labels describe the type of work only**: `development`, `ad hoc`, `rework` (`gh tt` uses these) and `blocked`. Don't create other labels, triage labels included. Don't apply status-style labels.
- **New issues** use the MoM template (`.github/ISSUE_TEMPLATE/standard-mom.md`). Write them as vertical slices with acceptance criteria, keep each one at effort M or smaller, and leave them in Backlog. A human decides when an issue is Ready.
- **Closing**: `gh deliver` resolves an issue when its branch lands on `main`. Don't close issues yourself unless the developer asks.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies, following the MoM template structure.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/DannyShayH/MTGO/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: use GitHub's native issue dependencies. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Older `gh`: `gh api --method POST repos/DannyShayH/MTGO/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric database id (`gh api repos/DannyShayH/MTGO/issues/<n> --jq .id`, not the `#number` or `node_id`). Where dependencies aren't available, put a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed. Work that is stuck on something outside the repo gets the `blocked` label.
- **Count open blockers**: `gh api repos/DannyShayH/MTGO/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable).
- **Comment on an issue**: `gh issue comment <number> --body "..."`

File issues only into `DannyShayH/MTGO`. Never file into `mattpocock/skills` (the repo these skills come from).

## Pull requests

AI agents push only through `gh wrapup` on the issue branch and never open PRs in this repo. PRs are not a triage surface.

## When a skill says "publish to the issue tracker"

Create a GitHub issue using the MoM template, and leave it in Backlog.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above. The current issue's number is the prefix of the branch name (`<issue-number>-<title>`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single parent issue with **child** issues as tickets. Since labels are reserved for work type, wayfinding uses titles instead of `wayfinder:*` labels.

- **Map**: a parent issue titled `Map: <topic>`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map (see **Make an issue a sub-issue of a parent**), titled `<type>: <title>` where type is `research`, `prototype`, `grilling` or `task`.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: list the map's open sub-issues and drop any with an open blocker or an assignee. The first one in map order wins.
- **Claim**: ask the developer to claim it. Starting work goes through `gh workon`, which only the developer runs.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then add a context pointer (gist + link) to the map's Decisions-so-far. Closing is up to the developer.
