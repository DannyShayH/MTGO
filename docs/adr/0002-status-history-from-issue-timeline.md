# Status history from the issue timeline, not from our own snapshots

Historical flow metrics (the Cumulative Flow Diagram and WIP limit breaches) are built from the `ProjectV2ItemStatusChangedEvent`, `ClosedEvent` and `ReopenedEvent` entries that GitHub already records in each issue's timeline. We do not save daily snapshots of the board. GitHub records every status change with a timestamp from the day an issue joins the project, so we get real history from the start, without a `metrics-data` branch, extra commits or the risk of a snapshot push triggering the TakT workflows.

## Considered options

- **Daily snapshots on a `metrics-data` branch** (the brief's proposal): independent of GitHub's API, but history only starts on the day collection starts, the resolution is one day, and the branch has to be kept out of `on_dev`, `on_ready` and `on_main`.

## Consequences

- The timeline only covers the `Status` field. History of `Priority`, `Size` and labels is not available, and no metric depends on it.
- The collector removes duplicate `"" → Backlog` events that GitHub records when an item is added.
- Cycle time still starts at the project's `Start date` field, not at the first `In Progress` event, because `Start date` is the team's policy (set by `gh workon`).
- If GitHub removes or changes these timeline events, history-based charts break, but the current-state metrics do not.
