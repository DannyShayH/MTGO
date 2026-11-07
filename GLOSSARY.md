# MTOGO

MTOGO is the team's food-ordering platform. This glossary holds the language of the product and of the way the team works.

## Way of working

**Work item**:
An issue on the project board that has no sub-issues. Parent issues are not work items, because their sub-issues are counted instead.
_Avoid_: Task, card, ticket (when counting flow)

**WIP**:
The work items with status `In Progress` or `Delivery Initiated` at a given moment. Work items in `Ready` are the ready queue, not WIP.
_Avoid_: Active work, ongoing issues

**Ready queue**:
The work items with status `Ready`, waiting to be pulled.

**Cycle time**:
The number of calendar days from a work item's start date to the date it was closed (closed date minus start date). A work item started and closed on the same day has a cycle time of less than one day.
_Avoid_: Lead time, duration

**Throughput**:
The number of work items closed as completed in one ISO week.
_Avoid_: Velocity

**Work item age**:
The number of calendar days from a work item's start date to today, for a work item that is not closed. It is counted the same way as cycle time.
_Avoid_: Age, staleness

**Old work item**:
An active work item whose work item age is above the current aging limit. The limit is a fixed number of days until there is enough history, then a percentile of past cycle times.
_Avoid_: Stale issue

**Blocked**:
A work item that is not closed and has the `blocked` label. A blocked work item in WIP is blocked WIP.

**Closed without delivery**:
A work item closed as "not planned". It counts in neither throughput nor cycle time.
_Avoid_: Cancelled, dropped

**Data problem**:
A fact about a work item that prevents a metric from being calculated honestly, such as a missing start date. A data problem is shown, never filled in with an invented value.
_Avoid_: Bad data, error

**Flow review**:
The team's weekly meeting, and the page it produces, where the team reads the flow metrics, names old or blocked work items, and agrees on one improvement experiment.
_Avoid_: Retro, status meeting

**Improvement experiment**:
One concrete change to the way of working, with an expected effect and a way to check it, tried for one week and followed up at the next flow review.
_Avoid_: Action point, improvement
