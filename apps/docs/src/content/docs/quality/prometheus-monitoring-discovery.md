---
title: Prometheus metrics and log viewing discovery
description: Confirmed scope and evidence for Prometheus metrics and Loki log viewing discovery under issues 167 and 168.
---

<!-- cspell:words prometheus LogQL -->

Discovery for [issue #168](https://github.com/DannyShayH/MTGO/issues/168), under
[parent #167](https://github.com/DannyShayH/MTGO/issues/167). The answers below
were agreed on 18 November 2026. The team explicitly confirmed shared
understanding of the consolidated scope and acceptance examples on that date.
This is the agreed discovery input for the team's separate specification and
ticket-splitting steps. It records requirements and investigated options,
not an implemented monitoring system.

## Confirmed scope

1. Maintainers use the first version to inspect staging after deployment and
   investigate traffic, errors and slow responses. Provide a reproducible local
   demonstration of that journey.
2. Start with the Medusa backend. Storefront, partner-app and infrastructure
   metrics are deferred from the first version.
3. Use dashboards for investigation. Automatic alert notifications are deferred.
4. Aim to host the monitoring stack on the existing Droplet, conditional on
   measured capacity before activation. If capacity is insufficient, revisit
   hosting with the team before adding cost. Same-host feasibility is not proven.
5. Cover ordinary backend API traffic, including authentication failures and
   validation errors. Verification must include failures that occur before
   application middleware.
6. Include backend process memory, CPU usage and event-loop delay alongside HTTP
   metrics. Host-wide and other-container metrics remain deferred.
7. Keep Grafana, Prometheus and scrape endpoints private. Maintainers initially
   access Grafana through an SSH tunnel using existing server access.
   Superseded for Grafana by the
   [access decision of 20 November 2026](#access-decision-20-november-2026).
8. Preserve metric history through monitoring restarts and redeployments. Retain
   up to seven days, subject to a disk limit that remains to be established.
9. Scrape every 15 seconds, refresh dashboards every 30 seconds and initially
   use five-minute windows for rate and latency panels.
10. Track long-lived SSE connections separately from ordinary HTTP latency
    percentiles. Show active streams and their outcomes separately.
11. Application startup and request handling remain independent of monitoring
    availability. Missing measurements are unavailable, not an
    invented successful or zero-failure result.
12. All project team members can view Grafana through private access. The
    repository admin handles installation and server access; the development
    team maintains dashboard definitions and troubleshooting instructions in Git.
    This clarifies the team's correction that everybody should have access.
13. Run Prometheus, Grafana, Loki and Alloy as a separately managed Compose
    stack. Application
    deployment and rollback must preserve monitoring services and their history.
14. Use normalized endpoint names when available, with fixed fallback categories
    for early rejections and unknown routes. Preserve failure counts without raw
    URL labels, identifiers or unbounded label values.
15. Distinguish zero traffic, target DOWN and missing data. Show request counts
    alongside rates and flag latency estimates based on little traffic. A
    successful scrape proves metrics reachability, not ordering or database
    readiness.
16. Exact memory caps and the disk budget remain explicitly pending until
    measurements under representative traffic and deployment peaks. Recorded
    results and a credible budget are required before monitoring activation.
17. Prefer a direct Prometheus client and keep distributed tracing deferred.
    Verify the collection hooks with integration tests before accepting them;
    revisit the approach if it cannot prove the required request coverage.
18. Track interrupted requests separately without inventing an HTTP 500 or
    counting them as completed responses. SSE disconnects likewise do not prove
    an application failure.
19. Exclude metrics scraping, health probes and Admin static assets from the main
    API traffic and latency panels. Show streaming activity separately.
20. Measure the HTTP-serving backend process in the first version. Any separate
    worker is explicitly outside its runtime coverage. State that scope on the
    dashboard and verify the actual staging process configuration before activation.
21. Low-traffic thresholds are configurable rather than fixed at the initially
    suggested 20 requests. Support 0 for staging and higher settings, such as
    100, as usage changes. Add a separate configurable high-traffic warning.
    Both use completed API requests per five minutes. All project team members
    can adjust dashboard controls without redeploying; shared defaults remain
    versioned in Git. These are dashboard indications, not automatic notifications.
22. Start staging with the low threshold at 0 and the high warning disabled until
    a team member sets a value. Low 0 disables the low-traffic indication; it
    does not turn missing observations into valid data.
23. Viewer adjustments affect the current dashboard view and its shareable URL.
    They do not change another viewer's settings or the team's starting defaults.
    Change shared defaults through Git.
24. Allow arbitrary nonnegative whole-number thresholds, rather than only preset
    options. Invalid input or a lower threshold above an enabled upper threshold
    must produce a visible configuration error, without a silent normal state.
25. Include existing structured application logs from backend, storefront and
    partner. Database, Redis, Caddy and other Droplet applications remain outside
    log collection scope. This does not add Next.js or infrastructure metrics.
26. All project team members can search and live-tail logs by time, service,
    severity and event, plus request ID where it already exists. Preserve the
    existing logging rules and correlation coverage; introduce neither new
    logging fields nor full request tracing through this viewer work.
27. Target up to seven days of Loki log retention, with a separate measured
    storage budget from Prometheus and Docker's local rotation. Include Loki
    and Alloy in the capacity evidence required before activation.
28. Give all project team members private log viewing through Grafana using the
    same access model as metrics. Loki and the collector remain private.
29. Send only recognized application events to Loki, rebuilding records from
    approved fields. Unclassified framework/startup records stay in Docker logs.
    JSON formatting alone does not establish that a record meets the contract.
30. On first collection, import available source logs from the preceding seven
    days, then follow new entries and resume from saved positions. Source logs
    already rotated away or removed with containers cannot be recovered.
31. Log collection is best effort, with bounded buffering and visible collection
    failures. It is not a guaranteed audit archive. Application operation must
    continue without collection; gaps and duplicates after failures remain
    possible and documented.
32. Protect application capacity when monitoring reaches its resource budget.
    Limit or stop collection and show resulting gaps explicitly rather than
    allowing monitoring to consume the application's required capacity.

Technical monitoring remains separate from the business reporting in
[Feature #54](https://github.com/DannyShayH/MTGO/issues/54). HTTP response time
must not be presented as Order processing time. The existing
[logging decision](/MTGO/architecture/decisions/0019-safe-application-logging-and-request-correlation/)
and business guarantees remain in force.

### Access decision (20 November 2026)

Items 7, 12 and 28 asked for private Grafana access, item 7 through an SSH
tunnel. On
20 November 2026 the developer chose a public, login-protected Grafana on the
staging Grafana hostname instead, behind Caddy over HTTPS. Why:

- Staging holds synthetic data only, and the dashboards show request counts,
  process and host readings and approved application events, nothing more.
- Team members do not need Droplet SSH access, or any identity on the
  server, to look. A tunnel would have meant an SSH identity per member
  (the deployment identity prohibits forwarding), which is broader than
  viewing needs.

What stays private: Prometheus, Loki, Alloy, Node Exporter and the backend
exporter publish no port and have no Caddy route, and the API's `/metrics`
answers 404. Caddy answers 404 for Grafana's server administration pages and
APIs. Anonymous access and sign-up are off; every member has an individual
Viewer account that cannot edit dashboards or data sources, and the CI
identity and the `staging-admin` account are never used for viewing.
[#181](https://github.com/DannyShayH/MTGO/issues/181) creates the accounts and
records each member's acceptance in the
[staging runbook](/MTGO/quality/staging-request-monitoring/#viewer-accounts-and-acceptance-181).

## Repository evidence informing the decisions

- `apps/backend/instrumentation.ts` is a commented tracing template. There is
  no enabled Prometheus pipeline in the inspected backend.
- `deploy/staging/compose.yaml` defaults to one backend process in shared mode.
  A separate worker is optional. An HTTP endpoint alone would not expose the
  runtime of a separate worker process.
- The [staging runbook](/MTGO/quality/staging-deployment/) describes a 2 GB
  Droplet with 2 GB swap, alongside existing PostgreSQL and Caddy. Application
  container memory ceilings total 1,536 MB before those existing services and
  the host. These ceilings are not measured usage or proof of spare capacity.
- Staging deployment is enabled despite the runbook's older activation wording.
  A successful [deployment run](https://github.com/DannyShayH/MTGO/actions/runs/44276188202)
  was inspected during discovery. This proves deployment activity, not current
  host health, memory headroom or the current worker configuration.
- The example Caddy configuration proxies the API hostname's whole path space.
  Adding `/metrics` to the ordinary API listener would require deliberate
  protection from public access.
- Installed Medusa 2.22.4 registers some parsing, authentication and CORS handling
  before application middleware. Ordinary application middleware alone is not
  evidence that early rejections are counted.
- Built-in workflow subscription endpoints use server-sent events. An open
  stream's lifetime needs a distinct treatment from ordinary HTTP latency.

## Integration and hosting evidence

These findings inform the preferred collection direction and the selected
monitoring lifecycle. Exact versions and verified integration details belong
to the later specification and implementation evidence.

The upstream [Node.js Prometheus client](https://github.com/prometheus/client_js)
now documents `@prometheus-io/client`, previously `prom-client`. Its registry,
counters, histograms and default runtime collectors are a candidate for the
confirmed metrics. Version selection belongs to the later specification.

[Node HTTP diagnostics channels](https://nodejs.org/docs/latest-v24.x/api/diagnostics_channel.html#http)
can observe requests before Express dispatch, making them a candidate for
counting early authentication/validation failures. These HTTP channels are
experimental. Source inspection is not proof of integration coverage; verify
startup timing, completed and aborted responses, and streaming behavior before
accepting the approach. OpenTelemetry metrics are another candidate; Medusa's
existing tracing setup alone does not supply the requested metrics.

The deployment script extracts only the release's Compose file, explicitly
starts known application services, and uses `--remove-orphans`. Adding monitoring
services or relative configuration mounts to that file alone is insufficient;
rollback to an older definition can also remove monitoring containers. An
independent monitoring stack with stable configuration and persistent volumes
is the agreed direction for keeping monitoring available during application
releases. The specification still needs the private backend network connection
and stable configuration/volume arrangement.

The deployment SSH identity prohibits forwarding. SSH tunnel access must use
appropriate identities provisioned for all project team members. Monitoring
viewing access does not require the CI deployment key or broad server privileges.
The tunnel was later replaced by a login-protected Grafana, see the
[access decision of 20 November 2026](#access-decision-20-november-2026).

[Grafana's installation requirements](https://grafana.com/docs/grafana/latest/setup-grafana/installation/)
recommend at least 512 MB RAM and one CPU core for Grafana itself. Adding that
memory to existing application ceilings already reaches the documented host's
2 GB before Prometheus and the other existing services. Ceilings are not usage,
so measured workload and release peaks must establish feasibility.

[Prometheus storage guidance](https://prometheus.io/docs/prometheus/latest/storage/)
requires room for the write-ahead log, active data and compaction as well as
retained blocks. A retention-size setting is not a strict total disk quota;
choose the eventual disk allocation and limit with overhead and free-space
headroom. Seven days is the agreed maximum retention target, not a guarantee
that all seven days fit an as-yet-unmeasured allocation.

## Dashboard contract

Provide one provisioned backend dashboard with collection availability, request
count/rate, HTTP status breakdown, 5xx proportion and ordinary API p95 response
time. Include the HTTP process's memory, CPU and event-loop delay, plus separate
streaming and interrupted-request panels. Show the selected backend, time window
and runtime coverage. Do not label scrape availability as application readiness
or claim visibility of a separate worker, database or the whole Droplet.

The traffic count used for thresholds is the backend's completed ordinary API
requests over a rolling five minutes, with the exclusions in Q19. It includes
completed 4xx and 5xx responses. It is not a count of people, concurrent users,
Orders or open streams. A Prometheus `increase` query estimates the window count
from sampled counters; it is not an exact business ledger. Counter resets must
be handled by the query rather than producing negative traffic.

Use a low indication when the valid count is strictly below the configured low
threshold, and a high warning when it is strictly above an enabled upper
threshold. Equality alone raises neither indication. The upper value is a
warning threshold, not rate limiting or a claim about safe host capacity. Keep
an explicit enable/disable state for the high warning rather than interpreting
all zero settings as disabled.

| Example settings and observations                           | Expected presentation                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Low 0, upper disabled, healthy collection, zero requests    | Low indication disabled; count 0; error proportion and p95 unavailable                                    |
| Low 100, upper 500, valid count 99                          | Low traffic; display the count and flag latency estimates                                                 |
| Low 100, upper 500, valid count 100 or 500                  | Neither low nor high indication                                                                           |
| Low 100, upper 500, valid count 501                         | High-traffic warning on the dashboard                                                                     |
| Low 100, upper 50; negative, fractional or nonnumeric input | Visible configuration error; no normal/healthy fallback                                                   |
| Missing samples, insufficient scrape history or target DOWN | Explicit collection/data state; thresholds do not fabricate a traffic count                               |
| Viewer changes low from 0 to 100                            | Current view and shareable URL change without redeployment; Git defaults and other viewers stay unchanged |

A zero observed error numerator with valid nonzero traffic can produce 0%.
With zero requests, error proportion has no denominator and remains unavailable.
P95 requires duration observations and enough scrape history to calculate it;
missing values stay unavailable even when low 0 suppresses the low indication.
Persisted graphs must retain visible collection gaps rather than presenting them
as zero errors or zero response time.

[Grafana variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/)
allow viewers to change a dashboard view without edit permissions and carry
values in its URL. Its [textbox controls](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/add-template-variables/)
are free text, so arbitrary numeric entry and cross-field validation still need
implementation evidence. Native threshold fallback must not silently replace
invalid input. Prove the chosen dashboard's validation and query behavior with
both direct controls and shared URL values; revisit the control mechanism if it
cannot meet the contract. No custom dashboard plugin is assumed approved by
this discovery.

## Candidate measurement definitions

These names illustrate a coherent contract for the later specification; they
are not exports already present in the backend. The specification should pin
the actual client/version and settle labels, duration buckets and queries.
Keep methods, endpoint patterns and fallback categories bounded. Do not attach
raw URLs, query strings, request IDs, Customer/Order IDs, personal data or error
messages to metrics.

| Candidate                                | Type and unit                 | Meaning                                                                                                  |
| ---------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `mtogo_http_requests_total`              | Counter, completed requests   | Ordinary API responses counted once with their final status, method and normalized route/fallback        |
| `mtogo_http_request_duration_seconds`    | Histogram, seconds            | Server-side duration of completed ordinary API requests; exclude SSE and interrupted requests            |
| `mtogo_http_requests_interrupted_total`  | Counter, interrupted requests | Incomplete ordinary API responses, separate from HTTP status counts                                      |
| `mtogo_sse_connections_active`           | Gauge, connections            | Currently established streams for bounded route categories                                               |
| `mtogo_sse_connections_closed_total`     | Counter, connections          | Stream termination outcomes, without interpreting disconnects as application failures                    |
| Client-provided process CPU metrics      | Counter, CPU seconds          | CPU consumed by the HTTP-serving Node process; a rate indicates cores used, not host-wide CPU percentage |
| Client-provided process memory metrics   | Gauges, bytes                 | Process resident and heap memory, with their scope visible                                               |
| Client-provided event-loop delay metrics | Gauges, seconds               | Delay statistics measured within that Node process                                                       |
| Prometheus `up`                          | Gauge, 0 or 1                 | Whether a scrape succeeded; not ordering/database readiness                                              |

Initial query behavior should express request rate as the sum of per-series
counter rates over five minutes; estimated count as the sum of per-series
counter increases; 5xx proportion as the eligible 5xx rate divided by eligible
completed-request rate; and p95 from aggregated duration histogram rates.
Account for absent status series, counter resets and missing observations
without masking collection failures. Choose duration resolution that can show
the relevant two-second browsing/status and five-second mock-submission
exercise targets. The targets remain those in
[ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/),
not new production guarantees.

## Acceptance examples and evidence needed

| Scenario                                                                                              | Expected evidence                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call a real read API such as `/store/products` using a disposable publishable key                     | Completed response increments once with its final status; duration is observed and appears in the provisioned dashboard                                                 |
| Omit the publishable key, fail authentication, or submit invalid JSON/body data                       | Early rejections are counted once despite preceding application middleware; use bounded fallback categories where no endpoint was selected                              |
| Exercise a controlled server error in an HTTP integration test                                        | One final 5xx outcome and one eligible duration; no public crash endpoint added                                                                                         |
| Repeat requests with different IDs and query strings, including unknown URLs and methods              | Metric label sets stay bounded; neither IDs nor arbitrary input appears in labels                                                                                       |
| Interrupt an ordinary request or disconnect an SSE client                                             | No invented 500 or duplicate completion; interrupted requests/stream outcomes appear separately; active stream count returns to its actual value                        |
| Scrape repeatedly and run normal health/static requests                                               | Main API traffic, duration and threshold totals exclude them                                                                                                            |
| Change thresholds to 0, 100 and another arbitrary valid value; try invalid values and reversed bounds | Viewer changes apply immediately without redeploy; invalid input is explicit; boundary examples above hold                                                              |
| Restart the backend and then recreate monitoring containers                                           | Counter resets preserve valid query interpretation; monitoring history survives its normal recreation; absent samples stay visibly absent                               |
| Deploy and roll back the application                                                                  | Independent monitoring stack and existing history remain; rollback to an uninstrumented application honestly shows unavailable metrics                                  |
| Stop Prometheus or Grafana while using the backend                                                    | Application remains usable; monitoring state does not report fabricated health or measurements                                                                          |
| Verify access as each project team member and from the public API hostname                            | Team members can view and tune variables through private access; scrape and UI listeners are not publicly exposed; viewers cannot overwrite provisioned shared defaults |
| Measure representative traffic and deployment/migration peaks                                         | Record CPU, memory, swap and storage observations plus chosen limits before activating on the 2 GB host                                                                 |

Use HTTP integration and focused unit tests for collection behavior. Check the
real Grafana dashboard as a viewer, including invalid URL-supplied variables,
without adding Playwright specifications. Validate Prometheus configuration
with its supported tooling and demonstrate a fresh local startup using
synthetic data. Do not run deliberate failures against the live staging system.

## Smallest demonstrable implementation candidate

The first candidate is a complete local journey: one HTTP-serving Medusa process
exposes private HTTP/runtime metrics; Prometheus scrapes them; and a provisioned
Grafana dashboard displays genuine API traffic, errors and latency with working
low/high controls. Use a real read endpoint and representative rejected/failed
requests as evidence while verifying coverage of the ordinary API surface.
A companion local journey sends recognized synthetic application events from the
three apps through Alloy and Loki into Grafana, proving collection filtering,
search and private viewer access. Metrics and logs remain distinct data sources.

Then connect the independently managed monitoring stack to staging through a
private listener/network, with repository-managed configuration and stable
volumes. Administrative provisioning and recorded capacity measurements precede
activation. The later specification and ticket split should keep each work
item independently demonstrable and effort M or smaller; this discovery does
not create those work items.

## Log viewing contract and evidence

Collect existing application events from the three named application services
through `Docker logs -> Alloy -> Loki -> Grafana`. Keep the same independent
monitoring lifecycle, private access and configuration ownership as the metrics
journey. Backend-only metrics scope does not restrict the separately agreed
three-app log coverage.

The [logging guide](/MTGO/quality/logging/) documents stdout logging and Docker
retaining five 10 MB files per configured service. Its local rotation is a
size bound, not seven days of guaranteed history. Production Next.js Winston
records are JSON; Medusa's application records retain the framework's wrapper.
Other framework/provider records may also be JSON and may bypass the shared
builder. Current safe events cover partner sign-in, some failures and cleanup
paths, not every request. Viewer work must neither imply complete coverage nor
silently widen the application's logging behavior.

### Collection boundary

Select the staging project and the backend, storefront and partner services;
exclude other projects, database, Redis, Caddy and one-off tool-container logs.
Verify the actual application service inventory and source selectors before
activation rather than assuming the repository defaults describe every live
container. Select known application event/schema combinations and rebuild the output
from the approved fields in
[ADR-0019](/MTGO/architecture/decisions/0019-safe-application-logging-and-request-correlation/).
Drop unknown records before Loki. Keep source timestamps and existing request
IDs where valid, without introducing new correlation guarantees. Browser console
logs and raw framework errors are outside the collected dataset.

[Alloy processing stages](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.process/)
can parse, filter and rewrite records. Extracting fields alone does not remove
the original log line, so the specification must prove that only the rebuilt
record is forwarded. Validate nested error classification and permitted scalar
values; selecting an allowed field name is not permission to retain secret text.
Unclassified output remains available through the existing Docker log path.

Keep indexed Loki labels few and bounded, such as service, environment and
severity. Request, actor, Restaurant and Order IDs remain searchable record
fields rather than indexed labels. Follow the
[Loki cardinality guidance](https://grafana.com/docs/loki/latest/get-started/labels/cardinality/)
and use LogQL field parsing for ID searches. Metric labels continue to exclude
such identifiers entirely.

[Grafana Viewer access](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/)
can query the available data source beyond dashboard filters. Therefore filtering
must happen before ingestion; a dashboard selector is not the collection
boundary. Provision individual private viewing access for all team members.
Keep Loki off public routes. The administrator must verify restricted collector
access to the Docker API: a read-only socket filesystem mount alone does not
restrict API methods. See [Docker daemon security](https://docs.docker.com/engine/security/).

### History, failure and capacity

[Alloy's Docker source](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
reads container logs and maintains positions under its component data directory.
Persist that state and keep component identities stable across recreation.
First startup may import only retained source records inside the seven-day
window; older records and unavailable source history must not be advertised as
recovered. Retain enough local state for normal resume, while documenting that
rotation, source-container replacement and outages can create gaps or duplicates.

[Alloy's Loki writer](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/)
provides dropped-record diagnostics, but saved source positions do not establish
lossless end-to-end delivery. Choose bounded queues/retries and make collection
failures and drops visible. A healthy collector with no matching records,
a failed pipeline and unavailable history must be distinguishable. Logs remain
operational diagnostics; durable business audit facts stay in their existing
systems. Monitoring the collection pipeline's own health supports this contract;
general infrastructure metrics remain deferred.

[Loki retention](https://grafana.com/docs/loki/latest/operations/storage/retention/)
requires enabled Compactor retention and persistent retention state. Deletion
is asynchronous. [Local filesystem storage](https://grafana.com/docs/loki/latest/operations/storage/filesystem/)
does not delete records in response to low free disk, so seven-day retention
alone is not a quota or a protection against filling the host. Specify and test
the measured storage allocation, free-space headroom and collection-limiting
behavior before activation. Include Loki ingestion/query/compaction and Alloy
restart catch-up in the CPU, memory and disk assessment.

### Log acceptance examples

| Scenario                                                                                     | Expected evidence                                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Emit a recognized safe event in each of the three applications                               | Each appears with correct service/time; search and live tail work through private viewer access                                        |
| Emit unknown or malformed records, JSON with extra fields, or a raw framework/provider error | Nothing outside the approved reconstructed record reaches Loki, even when the original input is valid JSON                             |
| Follow an existing correlated partner sign-in                                                | Search its existing request ID across partner/backend events; no request ID is assumed on unrelated events                             |
| Perform first startup with retained records inside and outside the seven-day window          | Eligible existing source records can appear; expired or unavailable history is not claimed recovered                                   |
| Recreate Alloy/Loki or replace an application container                                      | Persistent positions/history support normal resume and discovery of the new container; possible replay/gaps are documented             |
| Stop Loki or exhaust a simulated collection budget locally                                   | Backend and both Next.js apps continue; bounded collection behavior protects application capacity; failures, drops or gaps are visible |
| Query as a team Viewer beyond dashboard filters                                              | Only the approved collected dataset is reachable; raw excluded lines cannot be retrieved from Loki                                     |

Prove the filter/reconstruction contract with synthetic fixtures and validate
collector/storage configuration against pinned versions. Exercise recovery,
retention and budget behavior in a disposable local environment. These examples
are required implementation evidence, not tests already run during discovery.

## Confirmed discovery

Q1–Q32 are answered, including all-team private access, arbitrary adjustable
low/high thresholds, and the three-app application log viewer. The team explicitly
confirmed shared understanding of the consolidated discovery and acceptance
examples on 18 November 2026. No discovery design questions remain silently
unresolved. Host capacity remains explicitly deferred as described below.
Collection-hook coverage, dashboard input validation, safe log projection and
recovery/budget behavior require implementation evidence; documentation alone
does not establish that they work.

## Explicitly deferred operational measurements

The team agreed to settle exact memory caps and disk allocation from measured
workload and deployment peaks rather than invent them during discovery. The
repository admin and development team must record the observed capacity,
selected limits, storage overhead and free-space headroom before activation.
Include Prometheus, Grafana, Loki and Alloy together, covering ordinary traffic,
application releases/migrations, log queries/compaction and restart catch-up.
If same-host capacity is insufficient, reopen hosting with the team before
adding cost. This pending evidence does not imply permission to activate an
unmeasured stack or silently resize the Droplet.

## Reference and discovery boundary

Use [discount-monitoring](https://github.com/Tine-m/discount-monitoring/tree/257bbc1bb13127fd13952ab97e920003a5a8d31e)
as the example of application metrics, Prometheus scraping and provisioned
Grafana dashboards. Its Java integration and demonstration credentials do not
establish MTOGO's implementation or access model.

Shared understanding is confirmed. The team invokes its specification and
ticket-splitting steps separately; no implementation work items were created
by this discovery. Human delivery of the documentation remains part of TakT.
Discovery does not implement or deploy monitoring and does not complete parent
#167 by itself.
