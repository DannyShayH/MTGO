---
title: Non-functional requirements and their metrics
description: Which staging metric and Grafana panel shows each non-functional requirement of ADR-0014 and the monitoring feature, what monitoring cannot prove, and the team's acceptance of staging against it.
---

This is issue [#184](https://github.com/DannyShayH/MTGO/issues/184), the
acceptance slice of the monitoring feature
[#167](https://github.com/DannyShayH/MTGO/issues/167). It ties each
non-functional requirement to the metric that shows it on staging, and says
what monitoring deliberately leaves out. The targets come from
[ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/)
and the #167 specification. They are school-project validation assumptions,
not a production service guarantee.

The runbooks are
[local request monitoring](/MTGO/quality/local-request-monitoring/),
[staging request monitoring](/MTGO/quality/staging-request-monitoring/) and
[approved application events](/MTGO/quality/approved-application-events/).

## Requirements and their metrics

Every measured requirement has one stat in the **Requirements** row at the top
of **MTOGO — backend API requests and process**. Each stat reuses the query and
colours of an existing panel (named below), so the strip adds no new query. A
stat with no current evidence reads _Unavailable_ in grey, never green. Each
stat's panel link (the link icon in its corner) opens its row here.

| Requirement                                                                     | Target                                                                       | Source                  | Strip stat → detail panel                                                                                                                                   | What monitoring cannot prove                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <span id="browsing-p95"></span>Browsing and status response time                | 95 % within 2 s. Green below 2 s, amber from 2 s, red from 5 s               | ADR-0014                | **Browsing p95 within 2 s** → Ordinary API p95 response time (Latency and errors), Latency by route over time                                               | It is the p95 of all ordinary API routes over five minutes, Order submission included, so amber can come from submission alone: check **Slowest route patterns now**. Server-side time in the backend only: not the browser, the network, Caddy or Next.js rendering. A p95 from a few requests is weak evidence (see its observation count) |
| <span id="order-submission-p95"></span>Order submission response time           | Within 5 s with the mock payment provider answering at once. Red from 5 s    | ADR-0014                | **Order submission p95 within 5 s** → Ordinary API p95 by route pattern, `POST /store/carts/:id/complete` (Latency by route over time)                      | _Unavailable_ until an Order is submitted in the last five minutes. HTTP time of the submission request, not Order processing time ([#54](https://github.com/DannyShayH/MTGO/issues/54))                                                                                                                                                     |
| <span id="server-failures"></span>Server failures                               | 0 % 5xx. Green at 0 %, amber above                                           | #167                    | **Server failures (5xx)** → 5xx proportion (Latency and errors), Completed responses by status class                                                        | Refusals (4xx) are expected and not counted. Requests that never reached the backend, such as a Caddy error while it is down, are not counted at all                                                                                                                                                                                         |
| <span id="event-loop-delay"></span>Process saturation: event-loop delay         | p99 below 0.1 s. Amber from 0.1 s, red from 1 s                              | #167, #246              | **Event-loop delay p99** → HTTP-serving process event-loop delay (HTTP-serving process)                                                                     | Only the HTTP-serving backend process; the separate worker, the storefront and the partner app are not measured                                                                                                                                                                                                                              |
| <span id="backend-memory"></span>Process saturation: memory against the cap     | Below 80 % of the 768 MiB staging cap. Amber from 80 %, red from 90 %        | #167, #194              | **Backend memory, 768 MiB cap** → HTTP-serving process memory (HTTP-serving process)                                                                        | Resident memory of one process. The local demo has no cap, so its colours only mean something on staging                                                                                                                                                                                                                                     |
| <span id="host-memory"></span>Host headroom: memory                             | `available` in `free -m` at 200 MiB or more. Red below                       | #182, #183              | **Host memory headroom** → Host memory available, and its lowest in the displayed range (Host)                                                              | A reading every 15 seconds; a shorter dip can pass unseen. The capacity decision rests on the readings in [capacity across deploys](/MTGO/quality/staging-request-monitoring/#capacity-across-deploys)                                                                                                                                       |
| <span id="host-disk"></span>Host headroom: disk                                 | 20 % free or more. Amber below 20 %, red below 10 %                          | #182                    | **Host disk headroom** → Host disk free — Docker volumes (Host)                                                                                             | Which container fills the disk                                                                                                                                                                                                                                                                                                               |
| <span id="event-collection"></span>Event collection health                      | _Collecting_ (green). Red when Alloy or Loki is down, or entries are dropped | #167, #179              | **Event collection** → Collection state on **MTOGO — approved application events**, and its Collection health over time row                                 | Delivery is best effort, not an audit archive. _Collecting_ covers the three applications together, so one application that is not read can hide behind another                                                                                                                                                                              |
| <span id="availability"></span>Availability of the public site                  | Customers and staff reach the site through Caddy                             | #167                    | Not measured. `up` only says that Prometheus reached an exporter on the private network, not that the public site answers through Caddy                     | A probe from outside would need a Prometheus probe exporter (Blackbox Exporter) or an external check, with its own memory budget on the Droplet. Proposed as a follow-up, not part of #167. Until then, the deploy workflow's health check and the team's own use are the evidence                                                           |
| <span id="concurrent-journeys"></span>Twenty simultaneous user journeys         | Twenty journeys at once within the two response-time targets                 | ADR-0014                | Not measured. Completed responses per five minutes count requests, not users or journeys                                                                    | Needs a performance test that drives twenty journeys and reads the p95 stats above while it runs. Staging traffic alone never shows it                                                                                                                                                                                                       |
| <span id="business-guarantees"></span>Business guarantees and reporting dataset | Durable state, no duplicate payment, authorization, audit history, reports   | ADR-0014, ADR-0015, #54 | Not measured. These are verified by the backend's integration tests and, for reports, by the database ([#54](https://github.com/DannyShayH/MTGO/issues/54)) | Monitoring shows technical behavior only. No notifications, tracing or business reporting are part of #167                                                                                                                                                                                                                                   |

The colours are the ones the detail panels already use, listed in
[reading the dashboard at a glance](/MTGO/quality/local-request-monitoring/#reading-the-dashboard-at-a-glance-246).
To make room for the strip, the five charts and bars of Traffic and Latency are
four grid rows high instead of five, so the strip and both rows still fit on
one 1080p screen. Check that on your own screen during the acceptance.

## Accepting a deploy

The team accepts staging against the strip it uses after every deploy. Sign in
as a **Viewer** (your own account from
[#181](https://github.com/DannyShayH/MTGO/issues/181)) and, after a delivery
from the Deploy workflow:

1. On **MTOGO — backend API requests and process**, find the purple dashed
   **Backend restarts** marker at the time of the deploy. Set the time range
   to start a few minutes before it.
2. Use the site for a few minutes: browse a Restaurant, and submit an Order
   with the mock payment provider. Wait for the next refresh (30 seconds).
3. Read the **Requirements** row. **Browsing p95 within 2 s** and
   **Server failures (5xx)** should be green. **Order submission p95 within
   5 s** is green after your Order, and _Unavailable_ in grey when no Order
   was submitted in the last five minutes. Click a stat's link to open its row
   here.
4. Open the **Approved application events** link at the top right, which keeps
   the time range. **Event collection** should read _Collecting_. Search
   events by request ID, as in
   [the Viewer journey](/MTGO/quality/staging-request-monitoring/#viewer-accounts-and-acceptance-181).

A colour other than green is something to investigate, not a failed deploy by
itself: amber p95 right after a restart is the cold start, and a single 5xx
shows as amber until it leaves the five-minute window.

## Installing the strip on staging

The repository admin installs this dashboard, and the #246 dashboards before
it, with the release that carries this page:

```bash
sudo mtogo-deploy.sh monitoring update
```

Then, signed in to Grafana:

- **MTOGO — backend API requests and process** opens with the **Requirements**
  row at the top.
- The old **MTOGO — approved backend events** dashboard is gone from the
  **MTOGO** folder. Provisioning removes a dashboard whose file left Git
  (`disableDeletion: false`, #246).

## User stories of #167

Each story of the
[#167 specification](https://github.com/DannyShayH/MTGO/issues/167#issuecomment-6976954912),
with the issue that delivered it. _Partly met_ names what is still open: most of it is a staging check
that only the team can record. When it is recorded, change the status here.

| Story                                                            | Status       | Evidence                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inspect staging after a deployment                            | Partly met   | [#194](https://github.com/DannyShayH/MTGO/issues/194), the restart markers of [#246](https://github.com/DannyShayH/MTGO/issues/246) and this page's [deploy check](#accepting-a-deploy); the check is open in the [acceptance record](#acceptance-record)                                                                   |
| 2. Reproducible local journey                                    | Met          | [#169](https://github.com/DannyShayH/MTGO/issues/169), [local request monitoring](/MTGO/quality/local-request-monitoring/)                                                                                                                                                                                                  |
| 3. Request rates and estimated counts                            | Met          | [#169](https://github.com/DannyShayH/MTGO/issues/169)                                                                                                                                                                                                                                                                       |
| 4. Responses by final status                                     | Met          | [#169](https://github.com/DannyShayH/MTGO/issues/169), [#246](https://github.com/DannyShayH/MTGO/issues/246)                                                                                                                                                                                                                |
| 5. 5xx proportion with a valid denominator                       | Met          | [#171](https://github.com/DannyShayH/MTGO/issues/171)                                                                                                                                                                                                                                                                       |
| 6. p95 and its observation count                                 | Met          | [#171](https://github.com/DannyShayH/MTGO/issues/171)                                                                                                                                                                                                                                                                       |
| 7. Early authentication and validation rejections                | Met          | [#170](https://github.com/DannyShayH/MTGO/issues/170)                                                                                                                                                                                                                                                                       |
| 8. Bounded route patterns                                        | Met          | [#170](https://github.com/DannyShayH/MTGO/issues/170)                                                                                                                                                                                                                                                                       |
| 9. Process memory                                                | Met          | [#172](https://github.com/DannyShayH/MTGO/issues/172)                                                                                                                                                                                                                                                                       |
| 10. Process CPU with its unit                                    | Met          | [#172](https://github.com/DannyShayH/MTGO/issues/172)                                                                                                                                                                                                                                                                       |
| 11. Event-loop delay                                             | Met          | [#172](https://github.com/DannyShayH/MTGO/issues/172)                                                                                                                                                                                                                                                                       |
| 12. The covered process is named                                 | Met          | [#172](https://github.com/DannyShayH/MTGO/issues/172)                                                                                                                                                                                                                                                                       |
| 13. Server-Sent Event connections apart                          | Met          | [#173](https://github.com/DannyShayH/MTGO/issues/173)                                                                                                                                                                                                                                                                       |
| 14. Interrupted requests apart                                   | Met          | [#173](https://github.com/DannyShayH/MTGO/issues/173)                                                                                                                                                                                                                                                                       |
| 15. Scrape, health-probe and Admin static traffic excluded       | Met          | [#170](https://github.com/DannyShayH/MTGO/issues/170)                                                                                                                                                                                                                                                                       |
| 16. Zero traffic, DOWN and missing data distinct                 | Met          | [#171](https://github.com/DannyShayH/MTGO/issues/171)                                                                                                                                                                                                                                                                       |
| 17. Counter resets and gaps handled honestly                     | Met          | [#171](https://github.com/DannyShayH/MTGO/issues/171)                                                                                                                                                                                                                                                                       |
| 18. to 19. Low-traffic threshold, 0 disables it                  | Met          | [#174](https://github.com/DannyShayH/MTGO/issues/174)                                                                                                                                                                                                                                                                       |
| 20. to 23. High-traffic warning, enable switch, errors, equality | Met          | [#175](https://github.com/DannyShayH/MTGO/issues/175)                                                                                                                                                                                                                                                                       |
| 24. to 26. Per-view changes, shareable URL, defaults in Git      | Met          | [#174](https://github.com/DannyShayH/MTGO/issues/174), [#175](https://github.com/DannyShayH/MTGO/issues/175)                                                                                                                                                                                                                |
| 27. Private viewing access for every team member                 | Partly met   | [#181](https://github.com/DannyShayH/MTGO/issues/181); a login-protected Grafana instead of an SSH tunnel, [decided on 20 November 2026](/MTGO/quality/staging-request-monitoring/#access-model). The members' Viewer checks are [still open](/MTGO/quality/staging-request-monitoring/#viewer-accounts-and-acceptance-181) |
| 28. Viewing separate from server and dashboard administration    | Partly met   | [#181](https://github.com/DannyShayH/MTGO/issues/181); the admin checks are [still open](/MTGO/quality/staging-request-monitoring/#viewer-accounts-and-acceptance-181)                                                                                                                                                      |
| 29. Approved backend events                                      | Met          | [#176](https://github.com/DannyShayH/MTGO/issues/176)                                                                                                                                                                                                                                                                       |
| 30. to 31. Approved partner and storefront events                | Met          | [#177](https://github.com/DannyShayH/MTGO/issues/177)                                                                                                                                                                                                                                                                       |
| 32. to 35. Search, live tail, request IDs, coverage limits       | Met          | [#176](https://github.com/DannyShayH/MTGO/issues/176), [#177](https://github.com/DannyShayH/MTGO/issues/177)                                                                                                                                                                                                                |
| 36. to 38. Approved fields only, raw output in Docker, IDs       | Met          | [#176](https://github.com/DannyShayH/MTGO/issues/176), [#247](https://github.com/DannyShayH/MTGO/issues/247)                                                                                                                                                                                                                |
| 39. to 40. First import and resume                               | Met          | [#178](https://github.com/DannyShayH/MTGO/issues/178)                                                                                                                                                                                                                                                                       |
| 41. to 42. Best effort, visible drops, failed pipeline distinct  | Met          | [#179](https://github.com/DannyShayH/MTGO/issues/179)                                                                                                                                                                                                                                                                       |
| 43. History survives monitoring recreation                       | Partly met   | [#178](https://github.com/DannyShayH/MTGO/issues/178), [#180](https://github.com/DannyShayH/MTGO/issues/180); the [local rehearsal](/MTGO/quality/local-request-monitoring/#release-and-rollback-rehearsal-180) is not yet recorded                                                                                         |
| 44. Deploy and rollback preserve monitoring                      | Partly met   | [#180](https://github.com/DannyShayH/MTGO/issues/180), [releases and rollback](/MTGO/quality/staging-request-monitoring/#releases-and-rollback); the rollback rehearsal on staging is not yet recorded                                                                                                                      |
| 45. Rollback to an uninstrumented release shows Unavailable      | Partly met   | [#180](https://github.com/DannyShayH/MTGO/issues/180); the [local rehearsal](/MTGO/quality/local-request-monitoring/#release-and-rollback-rehearsal-180) is not yet recorded                                                                                                                                                |
| 46. Applications keep working while monitoring is down           | Met          | [#179](https://github.com/DannyShayH/MTGO/issues/179), [#180](https://github.com/DannyShayH/MTGO/issues/180)                                                                                                                                                                                                                |
| 47. Separate metric and log storage budgets                      | Met          | [#194](https://github.com/DannyShayH/MTGO/issues/194), [#178](https://github.com/DannyShayH/MTGO/issues/178), [memory budget](/MTGO/quality/staging-request-monitoring/#memory-budget)                                                                                                                                      |
| 48. Combined CPU, memory, swap and disk evidence                 | Partly met   | [#182](https://github.com/DannyShayH/MTGO/issues/182) shows it; the week of readings in the [capacity table](/MTGO/quality/staging-request-monitoring/#capacity-table) of #183 is still open                                                                                                                                |
| 49. Collection limited at its budget                             | Partly met   | Memory caps and Go limits ([#194](https://github.com/DannyShayH/MTGO/issues/194)), bounded retries and visible drops ([#179](https://github.com/DannyShayH/MTGO/issues/179)); whether the caps hold waits for the #183 [capacity table](/MTGO/quality/staging-request-monitoring/#capacity-table)                           |
| 50. Hosting reconsidered if the stack does not fit               | Partly met   | The rule and the floor are in [caps and floor](/MTGO/quality/staging-request-monitoring/#caps-and-floor); the decision waits for the #183 readings                                                                                                                                                                          |
| 51. Versioned configuration, pinned versions                     | Met          | `deploy/monitoring/`, every issue above                                                                                                                                                                                                                                                                                     |
| 52. Startup, access, failure, retention and recovery runbooks    | Met          | The three runbooks linked at the top of this page                                                                                                                                                                                                                                                                           |
| 53. Latency kept apart from Order processing and reporting       | Met          | The scope line on the dashboard ([#246](https://github.com/DannyShayH/MTGO/issues/246)); Order processing time stays with [#54](https://github.com/DannyShayH/MTGO/issues/54)                                                                                                                                               |
| 54. Tests through real boundaries                                | Met          | HTTP integration specs, promtool query tests and the disposable log checks of each issue above                                                                                                                                                                                                                              |
| Notifications, tracing, Next.js process metrics                  | Out of scope | Deferred by the #167 specification                                                                                                                                                                                                                                                                                          |

## Acceptance record

To be filled in by the team. Record dates and results only, never a password.
When every row is filled, record the acceptance on
[#167](https://github.com/DannyShayH/MTGO/issues/167) with a link to this page.

| Check                                                                   | Date and result |
| ----------------------------------------------------------------------- | --------------- |
| `monitoring update` installed this release's dashboards                 |                 |
| Requirements, Traffic and Latency rows on one 1080p screen              |                 |
| The old **MTOGO — approved backend events** dashboard is gone           |                 |
| As a Viewer: restart marker at the deploy                               |                 |
| As a Viewer: Browsing p95 and Server failures coloured, stat links open |                 |
| As a Viewer: Order submission p95 after submitting an Order             |                 |
| As a Viewer: Event collection _Collecting_, events found by request ID  |                 |
| The #180 release and rollback rehearsal, deferred to staging activation |                 |
| The team accepts the table above, including what is not measured        |                 |
