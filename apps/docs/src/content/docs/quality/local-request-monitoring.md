---
title: Local backend request monitoring
description: Completed ordinary backend API responses, including early refusals, 5xx proportion and p95 latency, plus the HTTP-serving process's CPU, memory and event-loop delay, through a private exporter, Prometheus and a provisioned Grafana Viewer dashboard.
---

This implements the local journeys of
[#169](https://github.com/DannyShayH/MTGO/issues/169),
[#170](https://github.com/DannyShayH/MTGO/issues/170),
[#171](https://github.com/DannyShayH/MTGO/issues/171),
[#172](https://github.com/DannyShayH/MTGO/issues/172),
[#173](https://github.com/DannyShayH/MTGO/issues/173) and
[#174](https://github.com/DannyShayH/MTGO/issues/174), under
[#167](https://github.com/DannyShayH/MTGO/issues/167). It measures every
completed ordinary API response from one backend process, including
authentication, publishable-key and body refusals before application
middleware, with its server-side duration. It shows rates, five-minute
counts, the 5xx proportion and ordinary API p95, and states plainly when
evidence is unavailable. Beside the requests it shows the CPU, memory and
event-loop delay of the same HTTP-serving Node process, and nothing wider:
no host, worker, Next.js or database runtime. It does not count Customers or Orders, and HTTP
latency is not Order processing time. Business state, logging
and request correlation retain their existing contracts.

## Scope and boundaries

| Component                    | Pinned version                             | Local access                             |
| ---------------------------- | ------------------------------------------ | ---------------------------------------- |
| Medusa                       | 2.22.4                                     | API at `127.0.0.1:9000`                  |
| HTTP process                 | Node 24.22.3 in the existing backend image | Single shared process                    |
| Prometheus JavaScript client | `@prometheus-io/client` 0.16.1             | Isolated backend registry                |
| Exporter                     | `GET /metrics`, Prometheus text 0.0.4      | `backend-metrics:9464`, no host port     |
| Prometheus                   | 3.16.0                                     | Internal `prometheus:9090`, no host port |
| Grafana OSS                  | 13.3.1                                     | `127.0.0.1:3000`, login required         |
| Disposable database          | PostgreSQL 16.16                           | Internal only, `medusa_ci_monitoring`    |

The source configuration lives in `deploy/monitoring/`. Two Compose projects
separate the application lifecycle from monitoring. The shared scrape network
and the database network are internal. The exporter binds to its alias on the
scrape network. Each project uses a separate bridge to publish its API or UI
port on `127.0.0.1`. Keep forwarded API/Grafana ports private in VS Code as well.

The application neither calls nor depends on Prometheus/Grafana. Exporter
configuration/bind failures warn and allow application startup to continue.
Monitoring is disabled unless `MTOGO_METRICS_ENABLED=1`. The supported
`medusa start`/`develop` hook runs once per process; migrations, builds,
`medusa exec`, worker mode and cluster children do not open competing exporters.
For a native development server, use `PORT` rather than a CLI `--port`
override and keep the default exporter bind at `127.0.0.1`.

There is no application-log collection, host/container/database/Redis or
Next.js process metrics, separate-worker runtime metrics or high-traffic warning yet.
The [confirmed discovery](/MTGO/quality/prometheus-monitoring-discovery/)
describes the later work. Seven-day Prometheus retention is a time policy,
not a storage quota or evidence that the full four-component stack fits staging.

## Fresh local startup

Use synthetic data only. Requirements: Docker Engine with Compose v2, Node,
curl, free loopback ports 9000/3000 and enough local build memory. Stop other
dev servers and run builds/integration suites serially. The commands below
run from `deploy/monitoring`; they never use staging `.env` files.

The repository devcontainer installs its own Docker engine and Compose using
the [Docker-in-Docker feature](https://github.com/devcontainers/features/tree/main/src/docker-in-docker).
The feature requires a privileged development container. Its engine runs
inside the devcontainer, so repository bind mounts resolve to the workspace
paths used below. After pulling this configuration, use VS Code's
**Dev Containers: Rebuild and Reopen in Container**. A new terminal in an old
container does not install the feature. Check the engine and Compose after
rebuilding, before starting the journey:

```bash
docker version
docker compose version
```

`docker version` must report both Client and Server. If VS Code cannot rebuild
with the Docker feature, check that Docker Desktop is running on the host and
that the host permits privileged development containers. You can also run the
same journey from a host checkout with Docker Engine and Compose available.

Generate local credentials in the ignored `.env` file. Do this once, before
creating volumes; regenerating it does not reset passwords already stored in
Grafana/PostgreSQL volumes. Do not capture credentials in acceptance evidence.

```bash
cd deploy/monitoring
node --input-type=module <<'NODE'
import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
const names = ["GRAFANA_ADMIN_PASSWORD", "GRAFANA_VIEWER_PASSWORD", "DEMO_DB_PASSWORD", "DEMO_JWT_SECRET", "DEMO_COOKIE_SECRET"]
writeFileSync(".env", names.map(name => `${name}=${randomBytes(24).toString("hex")}\n`).join(""), { mode: 0o600, flag: "wx" })
NODE
docker network create --internal mtogo-local-metrics
docker compose -f compose.application.yaml build migrate
docker compose -f compose.application.yaml up -d postgres
docker compose -f compose.application.yaml run --rm migrate
docker compose -f compose.application.yaml up -d backend
curl --fail --retry 60 --retry-all-errors --retry-delay 2 http://127.0.0.1:9000/health
docker compose config --quiet
docker compose run --rm --no-deps --entrypoint /bin/promtool prometheus check config /etc/prometheus/prometheus.yaml
docker compose run --rm --no-deps -v ./tests:/etc/prometheus/tests:ro --entrypoint /bin/promtool prometheus test rules /etc/prometheus/tests/dashboard-queries.test.yaml
docker compose up -d
```

The migration seed supplies a disposable publishable key and sales channel.
An empty product list is a genuine database-backed successful read. No
production product/customer data or external payment provider is needed.
The demo image uses the backend Dockerfile's `DISABLE_MEDUSA_ADMIN=true` build
argument to compile only the API; it does not need the Admin dashboard bundle.
The validation command overrides the image entrypoint with `/bin/promtool`;
the [pinned image normally starts Prometheus](https://github.com/prometheus/prometheus/blob/v3.16.0/Dockerfile).

Create a local Viewer through Grafana's administrative API. The password stays
in `.env`; the command emits only the resulting status, and never copies a key
or password into logs. Run once on the fresh Grafana database, after
`http://127.0.0.1:3000/api/health` responds successfully.

```bash
node --env-file=.env --input-type=module <<'NODE'
const response = await fetch("http://127.0.0.1:3000/api/admin/users", {
  method: "POST",
  headers: {
    authorization: `Basic ${Buffer.from(`local-admin:${process.env.GRAFANA_ADMIN_PASSWORD}`).toString("base64")}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ name: "Local Viewer", login: "local-viewer", email: "viewer@example.test", password: process.env.GRAFANA_VIEWER_PASSWORD }),
})
if (!response.ok) throw new Error(`Viewer creation failed: HTTP ${response.status}`)
console.log("Local Viewer created")
NODE
```

Log into Grafana as `local-viewer` using the ignored local Viewer password.
Open `http://127.0.0.1:3000/d/mtogo-backend-requests` (**MTOGO — backend API requests and process**). The provisioned dashboard
and data source are managed in Git; a Viewer cannot overwrite them. These
disposable accounts are not staging team-access provisioning.

## Observe one request

1. Wait for **UP — scrape succeeded** and at least two 15-second scrapes. The
   raw **Observed completed responses since process start** value starts at 0.
2. Run the demonstration below. It reads the seeded publishable key inside the
   application container, calls the real API and verifies HTTP 200. It logs
   `monitoring.demo_read.succeeded` with the separate `status` field.
   `medusa exec` does not start a second exporter even though the
   container has metrics enabled.
3. After the next scrape/30-second refresh, observe raw count **1** and
   `GET /store/products — HTTP 200`. The rolling five-minute count is an
   extrapolated estimate; it need not be exactly 1.
4. Repeat and confirm the raw count increases once per completed request.

```bash
docker compose -f compose.application.yaml exec backend npm exec --no -- medusa exec ./src/scripts/observe-local-request.js
docker compose exec prometheus promtool query instant http://localhost:9090 'mtogo_http_requests_total{job="mtogo-backend"}'
```

To demonstrate a final refusal status locally, omit the key. Expect HTTP 400,
then a separate status series after the next scrape. Repeat after a scrape to
make that status's increase/rate observable as well.

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' 'http://127.0.0.1:9000/store/products?synthetic=one'
```

To see the wider API coverage, send synthetic refusals and unknown traffic.
After the next scrape, expect `GET early_rejection — HTTP 401` for the admin
read, `POST early_rejection — HTTP 400` for the malformed body, and
`GET unmatched — HTTP 404` twice for the unknown URLs. The different IDs and
query strings do not create new series.

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' 'http://127.0.0.1:9000/admin/orders/order_synthetic'
curl --silent --output /dev/null --write-out '%{http_code}\n' -X POST -H 'content-type: application/json' --data '{"synthetic":' 'http://127.0.0.1:9000/store/carts'
curl --silent --output /dev/null --write-out '%{http_code}\n' 'http://127.0.0.1:9000/no-such-route-one?q=1'
curl --silent --output /dev/null --write-out '%{http_code}\n' 'http://127.0.0.1:9000/no-such-route-two'
```

## Interpret the view

`mtogo_http_requests_total{method,route,status}` increments only after response
`finish`. A subsequent close does not add a duplicate. An interrupted response
does not invent a completion or HTTP 500; it is counted separately (see
[streams and interrupted requests](/MTGO/quality/local-request-monitoring/#streams-and-interrupted-requests-173)).
IDs/query strings are discarded.

| `route` label                        | Meaning                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A pattern, e.g. `/store/carts/:id`   | The last registered route matched: the route file, or a route middleware that declares methods, such as body validation.                   |
| A wildcard, e.g. `/store/carts/:id*` | A route middleware registered with a wildcard and methods answered the request.                                                            |
| `early_rejection`                    | Refused (status 400 or above, not 404) before any route matched: publishable key, namespace or method-less authentication, malformed body. |
| `unmatched`                          | HTTP 404 with no matched route: usually an unknown URL, but also a 404 sent by method-less middleware.                                     |
| `unrouted`                           | Successful or redirect status with no matched route, such as a CORS preflight answered by Medusa's CORS middleware.                        |

Methods use a fixed allowlist plus OTHER. Health, `/metrics`, `/app`
Admin pages and assets, `/static`, exporter scrapes and established SSE
streams are excluded. A stream request refused before the stream opens keeps
its ordinary outcome. Labels come from Express's documented `req.route`; the
collector does not read private router stacks or patch installed packages.

Queries apply `increase(...[5m])` or `rate(...[5m])` **before** summing series,
which handles counter resets. The first successful-list series has a zero
baseline. Other outcomes appear when observed; Prometheus cannot recover an
unseen series' first increment. Missing history or fewer than two samples can
leave rolling values unavailable. Raw process counters are the acceptance
oracle for an exact first response. See the
[Prometheus query function semantics](https://prometheus.io/docs/prometheus/latest/querying/functions/).

Traffic queries require a successful `up` sample within the last 30 seconds,
two 15-second scrape intervals. The dedicated Prometheus instance sets its
instant-selector lookback to 30 seconds so old samples expire through
collection outages, while one slightly late scrape does not blank the whole
dashboard. A failed scrape still records `up=0` at once, so DOWN is not
delayed; only a stopped Prometheus takes up to 30 seconds to show as
unavailable. Failed or
missing scrapes yield unavailable traffic. Plots leave gaps at the chart's
query resolution. `up` describes scrape availability. Allow one scrape plus
dashboard refresh for a failure to appear. Backend restart resets its raw count.

## Latency, 5xx proportion and data states (#171)

`mtogo_http_request_duration_seconds{method,route}` records one observation
per completed ordinary response, in seconds, with the same labels and
exclusions as the counter. Buckets run from 5 ms to 10 s and include the
agreed 2 s browsing/status and 5 s Order-submission boundaries, plus `+Inf`.
It measures one HTTP request inside the backend process, not network time in
the browser and **not Order processing time** (Feature #54).

Every rolling query uses a five-minute window. Prometheus scrapes every 15
seconds and the dashboard refreshes every 30 seconds. **Unavailable** always
means there is no valid evidence; it never stands for zero.

| Panel                            | Query meaning                                                                                             | Unavailable when                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Data state                       | DOWN, insufficient history (fewer than two successful scrapes), UP quiet (0 responses) or UP with traffic | No `up` series for the target: never scraped or not configured |
| Completed response rate          | Responses per second, `rate` per series before `sum`                                                      | DOWN, absent target or fewer than two samples                  |
| 5xx proportion                   | 5xx rate divided by all completed responses. With traffic but no 5xx series yet, it is 0%.                | Zero completed responses (no denominator), DOWN or absent      |
| Ordinary API p95                 | `histogram_quantile(0.95, …)` over buckets summed across series, never an average of percentiles          | No duration observations in the window, DOWN or absent         |
| Duration observations behind p95 | Estimated number of durations in the window; read it before trusting a p95                                | No histogram (for example an older, uninstrumented release)    |
| p95 by route pattern             | The same estimate per `method`/`route`, drawn only for routes with observations                           | As above, per route                                            |

A p95 that lands in the overflow bucket is shown as 10 s, meaning "at or above
10 s". A counter reset after a backend restart is absorbed by `rate` and
`increase`; it never makes traffic negative. A 5xx response whose series was
not seen before the window starts can be missed, as described above.

The semantics are tested against the pinned Prometheus query engine with
synthetic series in `deploy/monitoring/tests/dashboard-queries.test.yaml`
(the `test rules` command above): healthy zero traffic, only 4xx, a 25% 5xx
share, DOWN, absent target, one scrape of history, requests without any
duration histogram, a collection gap inside the window and a counter reset
inside the window. A backend unit test
fails when a dashboard query is missing from that file, uses a window other
than five minutes or the refresh/scrape timing changes. `promtool` evaluates
with its default five-minute lookback, not the dashboard Prometheus's 30
seconds, so the DOWN case uses Prometheus's stale markers as a real failed
scrape does.

To see a server failure locally without a crash endpoint, make the disposable
database unavailable, send a read, then restore it. Record the returned status
and how long it took: the backend may wait for its database connection before
answering, which also shows a slow response in the p95.

```bash
docker compose -f compose.application.yaml stop postgres
curl --silent --output /dev/null --write-out '%{http_code} %{time_total}s\n' 'http://127.0.0.1:9000/store/regions'
docker compose -f compose.application.yaml start postgres
```

## HTTP-serving process: CPU, memory and event-loop delay (#172)

The bottom row covers the **one HTTP-serving backend Node process**: the
same `backend-metrics:9464` target (job `mtogo-backend`) the request panels
use. The private registry runs `@prometheus-io/client`'s standard
`collectDefaultMetrics` collectors. On each scrape they read this process's
own counters. The **HTTP-serving process scope** panel states the target,
units and limits.

| Panel                      | Query                                                                  | Unit and meaning                                                                                                                                                                                                                  | Useful range                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU — cores used           | `rate(process_cpu_seconds_total[5m])`                                  | User plus system CPU seconds used per second, averaged over five minutes. **1 = one full core**; a busy process can exceed 1 with native threads.                                                                                 | Near 0 when quiet. Node runs JavaScript on one thread, so close to 1 for minutes means the process is CPU-bound and requests queue. It is not host utilization: a 100% busy host can show a low value here, and the reverse. |
| Memory — bytes             | `process_resident_memory_bytes`, `nodejs_heap_size_{used,total}_bytes` | Resident set (RSS: RAM the OS holds for the process: code, heap, buffers, native memory) and V8 heap used/total (JavaScript objects). RSS > heap total > heap used.                                                               | A booted backend holds a few hundred MB RSS. Steady growth over hours that never falls back suggests a leak. Compare RSS with the container memory cap on staging.                                                           |
| Event-loop delay — seconds | `nodejs_eventloop_lag_{p50,p99,max}_seconds`                           | Time between ticks of Node's 10 ms sampling timer, from `perf_hooks.monitorEventLoopDelay`, over the window since the **previous scrape** (~15 s). Every scrape resets the statistics; time above the 0.01 s resolution is delay. | Around 0.01 s (the sampling resolution) when healthy. A p99 above about 0.1 s for several scrapes means requests wait behind blocking work; correlate with the p95.                                                          |

Every query requires the target's latest scrape to be UP, so a stopped
backend reads **Unavailable**, never its last value. The CPU rate needs two
scrapes and is Unavailable until then. A gauge from one successful scrape is
current evidence and is shown. CPU seconds count from exporter start, not
process start. A restart resets them and `rate` handles that.

Limits of the chosen collectors:

- Delay statistics cover the time since the last scrape of that exporter.
  Only Prometheus should scrape it: an extra `curl` to `/metrics` resets the
  window and shortens what the next scrape reports.
- Node needs one 10 ms sample after a reset before it measures again. A block
  that starts within about 10 ms after a scrape can go unreported.
- `max` is the worst single sample since the previous scrape. Between
  scrapes it reports nothing about which request caused it.
- The client also exports its other standard series (CPU user/system split,
  virtual memory, process heap, start time, external memory, the
  `setImmediate`-based `nodejs_eventloop_lag_seconds` and lag min/mean/stddev/p90,
  GC duration, active handles and resources, file descriptors, heap spaces,
  event-loop utilization, `nodejs_version_info`). They are bounded, available for ad hoc
  queries and not on the dashboard. The client offers no teardown for its
  event-loop monitor, GC observer and 100 ms utilization timer. They
  do not keep the process alive and stop at process exit; production starts the exporter once per process.

To see the panels react locally, send a short synthetic burst to the real
API, then compare CPU and event-loop delay with the quiet period before it.
Keyless reads are refused with 400, so the burst also appears as
`early_rejection` responses, not as 5xx:

```bash
for i in $(seq 1 500); do curl --silent --output /dev/null 'http://127.0.0.1:9000/store/products?synthetic=burst'; done
```

## Streams and interrupted requests (#173)

Two kinds of traffic do not fit "one request, one completed response, one
duration". The row under the p95 charts shows them, and the ordinary panels
above never include them.

| Panel                                  | Query                                                 | Meaning                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-sent event connections — active | `mtogo_sse_connections_active`                        | Established kitchen feeds (`/partner/orders/stream`) open at the last scrape. Computed from the real open responses on each scrape.                                        |
| Server-sent event terminations — 5 min | `increase(mtogo_sse_connections_closed_total[5m])`    | Established feeds that ended, once each: `server_ended` (session expiry, revoked access, feed error) or `disconnected` (the connection closed first: tab closed, network). |
| Interrupted requests — 5 min           | `increase(mtogo_http_requests_interrupted_total[5m])` | Ordinary requests whose connection closed before the response finished, by method and matched route (`unrouted` if none had matched). No status, no duration.              |

A feed is established when its 2xx headers are sent. Its lifetime (minutes to
hours) would otherwise dominate the p95, so it never adds a completed response
or duration. A feed **refused** before that point, for example with 401, is an
ordinary completed response with that status. A disconnect is **not an
application error**: browsers and the partner app reconnect. Many
`disconnected` terminations while kitchens report problems point at the
network or proxy, not the backend.

An interrupted request settles when its connection closes. If the route later
fails because of the disconnect, Medusa's error handler cannot add a 500,
because that request already has its one outcome. A finish/close race also
yields exactly one outcome. All three panels follow the same rules as the
others: they require a current scrape, rolling values need two scrapes, and
0 with a current scrape is a real zero.

Hold one real kitchen feed open for 45 seconds, then disconnect. The script
creates a synthetic Restaurant once and a new synthetic staff member per run,
with a random password it never prints. `STREAM_HOLD_SECONDS` (1–600) changes
the hold time.

```bash
docker compose -f compose.application.yaml exec backend npm exec --no -- medusa exec ./src/scripts/observe-local-stream.js
```

While it runs, **active** reads 1. After it ends and the next scrape, active is
0 and terminations show one `disconnected`. The ordinary counts, rate and p95
do not change, apart from the staff sign-in, an ordinary completed response
labelled `POST /auth/:actor_type/:auth_provider`. The rolling termination
value is an extrapolated estimate (about 1.07 for one), like the other
rolling counts.

To see an interruption, stop the database and give up on a read that waits for
it. The publishable-key check waits for PostgreSQL, so the client leaves first:

```bash
docker compose -f compose.application.yaml stop postgres
curl --silent --max-time 2 --output /dev/null -H 'x-publishable-api-key: pk_synthetic' 'http://127.0.0.1:9000/store/regions'; echo "curl exit $?"
docker compose -f compose.application.yaml start postgres
```

`curl` exits with 28 (timed out). After the next scrape, **Interrupted
requests** shows one `GET unrouted`, and no 500 or duration was added for
it, even after the database returns. `GET unrouted` and
`GET /store/products` start at zero, so their first interruption is visible
in the rolling value. Like other outcomes, an interruption series seen for the
first time inside the window misses its first increment; the raw counter
`mtogo_http_requests_interrupted_total` has the exact count.

## Low-traffic indication per Viewer (#174)

The **Low traffic below** box at the top of the dashboard holds a whole
number. The **Low-traffic indication — rolling 5 minutes** panel compares it
with **Estimated completed responses — rolling 5 minutes**: the same
extrapolated count of completed ordinary API responses, with the same
exclusions (health, scrapes, Admin assets, established streams and
interrupted requests). It is not a count of users, Orders or the lifetime
counter, and it is evaluated at the end of the displayed range whatever range
you choose. It is a visual indication only: no request limit, capacity claim
or notification.

| Panel reads                                           | When                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Configuration error — invalid Low traffic below**   | The value is not digits only from `0` to `999999999999999`. No threshold is applied, saved or rounded. |
| **Unavailable — no valid count**                      | The target is DOWN or absent, or there are fewer than two samples. Also with threshold 0.              |
| **Off — threshold 0**                                 | The threshold is `0` and a valid count exists. This is the Git default.                                |
| **LOW traffic — read p95 with its observation count** | The count is strictly below the threshold. Read the p95 with its observation count.                    |
| **Not low — at or above**                             | The count is equal to or above the threshold.                                                          |

Accepted values are `0` and whole numbers without a leading zero, up to 15
digits (exact as a floating-point number). Everything else is a configuration
error: negative, fractional (`1.5`, `100.0`), exponent (`1e3`), hexadecimal,
signed (`+5`), leading zeros (`007`), separators (`1_000`), spaces, empty,
`NaN`, `Infinity`, 16 or more digits and text such as `100) or vector(1`.
The count is an estimate, so 99.99 against 100 is LOW; 100 exactly is not.

**Your view only.** Typing a value updates the panel and the URL
(`?var-low_traffic_threshold=750`) without a redeploy. Share that URL to share
the setting. Nobody else's view changes, and the Git default (`0`) stays:
Viewers cannot save the dashboard. To change the shared default, change
`templating` in `grafana/dashboards/backend-requests.json` in an issue.
Grafana 13.3.1 keeps the first value of a repeated URL parameter
(`?var-low_traffic_threshold=100&var-low_traffic_threshold=750` shows and
uses `100`) and rewrites the URL to that single value.

**How the value reaches the query.** Grafana inserts the value only as
`"${low_traffic_threshold:percentencode}"`, inside a PromQL string. Percent
encoding leaves only letters, digits and `-_.~%`, so input can never end the
string, become a query or expand a `label_replace` reference such as `$1`.
The query checks that string against `0|[1-9][0-9]{0,14}` and converts it to
a number with `histogram_quantile(1, …)` over a one-bucket histogram whose
`le` is the value: PromQL's only way to read a number from a label. A rejected
value yields no number, and the panel shows the configuration error. A unit
test fails if the variable appears anywhere in another form.

The promtool file holds the acceptance table against the pinned engine: low 0,
99, 100, 101, 750, 749, 751 and the 15-digit maximum, against counts of
exactly 100, just under 100, exactly 750 and valid zero; DOWN, absent and
one-scrape targets; and each invalid class above, as Grafana encodes it. The
backend unit test fails if any of its 24 representative inputs (each
invalid class, 0, 99, 100, 101, 750 and both 15/16-digit boundaries) is
missing from the file.

## Operation, failure and cleanup

Stop either monitoring service locally and run the real read again. The API
must remain usable. Stopping Grafana removes the viewer only. Stopping
Prometheus creates a collection gap. Stopping the backend makes the next
scrape DOWN and traffic unavailable. Restore the stopped component with
`docker compose up -d` or the application Compose command.

```bash
docker compose stop prometheus
docker compose -f compose.application.yaml exec backend npm exec --no -- medusa exec ./src/scripts/observe-local-request.js
sleep 35
docker compose up -d prometheus
docker compose -f compose.application.yaml restart backend
docker compose up -d --force-recreate
```

After Prometheus resumes, inspect the recent status and rate charts as a Viewer.
At the default 15-minute zoom, the pause should leave a break between the
samples before and after it.

Normal recreation preserves named monitoring volumes. Application restart,
recreation or `docker compose -f compose.application.yaml down` does not remove
monitoring history. Data generated while Prometheus is stopped is not guaranteed
recoverable, especially across backend restart. Rollback to an uninstrumented
app would leave collection unavailable. Staging activation, persistence and
rollback are in [staging request monitoring](/MTGO/quality/staging-request-monitoring/).

To stop this demonstration, run both `down` commands without `--volumes`.
Only when intentionally discarding **local synthetic history**, add
`--volumes` to each command and remove the unused shared network. Delete the
ignored `.env` only when resetting both databases too.

```bash
docker compose -f compose.application.yaml down
docker compose down
```

## Troubleshooting

| Symptom                                            | Check/action                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target DOWN                                        | Check backend logs for the constant metrics warning, backend startup, port 9464 and the shared network alias. Never publish 9464 to fix connectivity.                                              |
| Raw 0 after read                                   | Confirm the read returned 200, the API uses `PORT=9000`, metrics is enabled and the next scrape occurred. Excluded paths and established streams are not counted.                                  |
| Rolling count unavailable or surprising            | Wait for two scrapes; generate another request. Inspect raw count and `up`. Increases are estimates and new series lack earlier history.                                                           |
| Health is OK, scrape fails                         | API health and exporter availability are independent. Check exporter bind/configuration and private DNS.                                                                                           |
| Exporter warning                                   | Check port collision, a valid integer port and bind address. API startup continues; restart the backend after fixing configuration.                                                                |
| Grafana login fails after `.env` changes           | Stored credentials survive recreation. Restore the original local file or deliberately reset disposable volumes.                                                                                   |
| p95 or 5xx proportion Unavailable while UP         | Expected with no completed responses or no duration observations in five minutes. Check **Data state** and the observation count; send a real read.                                                |
| Data state shows Insufficient history              | Fewer than two successful scrapes in five minutes, for example right after Prometheus or the backend started. Wait 30 seconds.                                                                     |
| p95 shows exactly 10 s                             | The 95th percentile is in the overflow bucket: at least 10 s. Investigate the slow route in **p95 by route pattern**.                                                                              |
| Process panels Unavailable while requests show     | The CPU rate needs two scrapes; wait 30 seconds. If memory is also Unavailable, the backend release predates #172 and exports no process collectors.                                               |
| CPU above 1 core or much lower than `top`          | It is this one process, in cores, averaged over five minutes. `top` shows instantaneous whole-host or per-thread figures; they are different measurements.                                         |
| Event-loop delay jumps when you `curl` `/metrics`  | A manual scrape resets the delay window. Read the values in Grafana, or query Prometheus, instead of scraping the exporter by hand.                                                                |
| Active streams stay at 0 while a kitchen is open   | The feed may be refused (401/403 are ordinary responses) or the partner app may be polling instead. A stream endpoint missing from `STREAM_ROUTES` is counted as an ordinary request when it ends. |
| Many `disconnected` terminations                   | Not a backend error. Check the proxy timeouts, the network and whether clients reconnect; a deploy ends feeds without recording them, because collection stops with the old process.               |
| Interrupted requests rise                          | Clients gave up before the response finished. Check the p95 of the same route and the event-loop delay: slow responses lead to timeouts.                                                           |
| Low-traffic panel shows a configuration error      | The box holds something other than digits only, 0 to 999999999999999. Remove spaces, signs, decimals and leading zeros; 0 turns the indication off.                                                |
| Low-traffic panel Unavailable with a valid value   | No valid five-minute count: check **Data state**. A threshold, including 0, never turns DOWN or missing samples into data.                                                                         |
| Someone else sees a different low-traffic result   | Thresholds live in each view's URL. Compare the `var-low_traffic_threshold` values; the Git default is 0.                                                                                          |
| `test rules` fails after a dashboard change        | Update the expression and expected values in `tests/dashboard-queries.test.yaml` together; the backend unit test names any query the file lacks.                                                   |
| Dashboard absent                                   | Check Grafana provisioning logs and the mounted dashboard/provider/data-source paths; keep the pinned versions together.                                                                           |
| `docker: command not found`                        | Rebuild and reopen the devcontainer with the Docker-in-Docker feature, then check `docker version` and `docker compose version`.                                                                   |
| Docker client exists but cannot reach its server   | Check the feature startup log `/tmp/dockerd.log` and host support for privileged development containers; a client alone cannot run the journey.                                                    |
| No configuration file found                        | Run the monitoring commands from `deploy/monitoring`, not the repository root.                                                                                                                     |
| PostgreSQL refuses `localhost:5432` for HTTP tests | Rebuild the repository devcontainer. Do not redirect tests to `postgres`, which causes Medusa SSL problems. The Compose demo owns a separate database.                                             |

## Verification and manual acceptance record

The focused unit suite uses real Node HTTP requests and a real exporter:
final 200/401/500, one count per response, ID/query/method bounds, excluded
traffic, interrupted responses, disposal/rebind and an occupied exporter port.
The real Medusa suite creates synthetic keys/channels with core workflows,
then reads products and checks publishable-key/parser refusals through HTTP.
It exercises the same startup register hook and checks exported text, not
internal counters. No public crash endpoint or Playwright specification is added.

```bash
cd apps/backend
npm run test:unit -- src/observability/__tests__
npm run test:integration:http -- request-metrics.spec.ts
```

Agent verification on 19 November 2026, on the uncommitted #169 working tree:

| Boundary                              | Observed result                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP/exporter and startup guards | **34 tests passed**, including invalid ports, minimum/maximum boundaries, matching ports, startup guards and idempotent registration.                                                                            |
| API production build                  | `DISABLE_MEDUSA_ADMIN=true npm run build` passed. The full Admin bundle attempt reached Node's 2 GB heap limit; the disposable image explicitly omits that bundle.                                               |
| Repository checks                     | Root lint and architecture checks passed. Docs type check, build and internal-link checks passed.                                                                                                                |
| Prometheus 3.16.0                     | Native `promtool check config` passed, and all five dashboard query expressions parsed successfully.                                                                                                             |
| Compose configuration                 | Standalone Compose CLI 5.8.0 rendered both files successfully with synthetic configuration values.                                                                                                               |
| Grafana 13.3.1 Viewer                 | Provisioning and the actual Viewer role were verified. Dashboard saving returned 403. A deliberately unavailable target produced `up=0` and no traffic observations through Grafana's query API.                 |
| Viewer rendering                      | Inspected at 1440 × 1100 and 390 × 844, including keyboard focus, long coverage notes, DOWN and unavailable values. Coverage notes fit, unavailable values are neutral and there is no horizontal page overflow. |

The Grafana/Prometheus checks used standalone pinned binaries on loopback,
with hostname/path substitutions for their local test directories. They did
**not** substitute a fake application for the real Medusa acceptance journey.
No Playwright specifications were added. The standalone TypeScript command
also reported existing customer-auth/Admin/menu-typing errors; the supported
API build above succeeded after Medusa generated its types.

Agent verification after rebuilding the devcontainer on 19 November 2026
used revision `9383596` with the local Compose corrections:

| Boundary          | Observed result                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medusa HTTP suite | `request-metrics.spec.ts` passed against PostgreSQL on loopback.                                                                                                                             |
| Compose startup   | Built the API image, migrated a fresh disposable database, verified the pinned `promtool` config and scraped the private exporter successfully.                                              |
| Grafana Viewer    | Limited coverage and UP were visible. A real product read increased the raw count from 0 to 1 and rendered HTTP 200. A repeat added one. A keyless read rendered a separate HTTP 400 series. |
| Access            | Viewer writes to the dashboard and data source returned 403. Only API and Grafana published loopback ports. The API returned 404 for `/metrics`.                                             |
| Recovery          | The real read succeeded with both monitoring services stopped. Stopping the backend made traffic unavailable. Restart reset the count and monitoring recreation retained historical samples. |

The review follow-up passed 44 observability unit tests and repeated the real
HTTP and Viewer checks. During a 36-second Prometheus stop, a real read succeeded
and emitted one structured event with status 200. After recovery, both Grafana
charts returned samples on either side of the gap and no sample at an outage
timestamp where a five-minute lookback still returned a value.

For issue #169, the developer accepted the recorded Grafana Viewer run above
for wrapup. Use this checklist to repeat the acceptance run:

- Fresh startup and pinned `promtool check config` succeed.
- Viewer sees limited-coverage text, UP, raw 0 → 1 and the final HTTP 200 series.
- Repeated read adds one; keyless read yields a separate HTTP 400 series.
- Exporter/Prometheus have no host ports; API `/metrics` does not expose metrics.
- Viewer cannot overwrite the provisioned dashboard or data source.
- Prometheus/Grafana stoppage leaves the real read usable; collection gaps remain visible.
- Backend restart resets raw counts; normal monitoring recreation retains history.

### Ordinary API coverage (#170)

The real Medusa suite drives a genuine unauthenticated admin read (401), a
missing publishable key (400), a malformed JSON body (400) and a Zod-invalid
cart body (400). It also sends repeated IDs and query strings, unknown URLs, an
unknown method, a CORS preflight, health, Admin and stream traffic. It asserts the exact
exported series and that no ID, query value or raw method appears. The unit
suite covers label choice, the fixed fallbacks, regular-expression matchers
and established-versus-refused stream requests through real Node HTTP.

Agent verification on 20 November 2026, on the uncommitted #170 working tree:

| Boundary           | Observed result                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP/exporter | **48 unit tests passed**, including `unmatched`, `early_rejection`, `unrouted`, the 400 and stream 2xx boundaries, regular-expression labels and excluded paths.           |
| Medusa HTTP suite  | **5 tests passed** in `request-metrics.spec.ts`: 401, missing key, malformed and invalid bodies, ID/query collapse, unknown routes/methods, CORS preflight and exclusions. |

The Grafana Viewer run for this slice is the developer's manual acceptance.
Repeat the startup above and check:

- The **Request coverage** panel describes ordinary API coverage and the fallbacks.
- The admin, malformed-body and unknown-URL commands above each add one
  response to the expected `early_rejection` or `unmatched` series.
- Repeating a command with a different ID or query string adds to the same series.
- Health, `/app` and the scrape itself leave the totals unchanged.

No staging capacity, combined four-component budget or activation acceptance is
claimed by this local slice. Staging metrics (#194) reuse the same dashboard,
now titled **MTOGO — backend API requests and process**, and record their own acceptance on
the [staging request monitoring](/MTGO/quality/staging-request-monitoring/) page.

### Latency and 5xx proportion (#171)

The unit suite sends real Node HTTP requests, including one that waits 300 ms,
and reads the exported histogram: bucket boundaries, an empty 0.25 s bucket,
counts in the 2 s, 5 s and `+Inf` buckets, a sum of at least 0.3 s, no
duration for an interrupted response and no query values in labels. The real
Medusa suite reads `/store/regions` (200), causes a test-only 500 by making the
region module's read reject once inside the process, and sends an invalid
`limit` (400). It asserts one counter increase per status and three duration
observations, with no error text or query value exported.

Agent verification on 20 November 2026, on the uncommitted #171 working tree:

| Boundary                | Observed result                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP/exporter      | **55 request-metrics unit tests passed**, including the duration histogram and interrupted-response cases.                                                          |
| Dashboard queries       | **29 dashboard-query unit tests passed**: every query is in the promtool file, uses `[5m]`, refresh is 30 s and scrape is 15 s.                                     |
| Medusa HTTP suite       | **6 tests passed** in `request-metrics.spec.ts`, including the controlled 500 through `/store/regions`.                                                             |
| Prometheus query engine | **Not run by the agent.** The devcontainer had no Docker engine and downloading `promtool` was not permitted. Run the `test rules` command above before acceptance. |
| Grafana Viewer          | **Not run by the agent**, for the same reason. This is the developer's manual acceptance below.                                                                     |

Repeat the startup above, run the `test rules` command, then check as a Viewer:

- **Data state** reads _UP — quiet, 0 responses_ after startup; 5xx proportion
  and p95 are **Unavailable**, the observation count is 0.
- After a few real reads, the state is _UP — traffic observed_, the 5xx
  proportion is 0% and p95 has a value with its observation count beside it.
- A keyless read (400) does not change the 5xx proportion.
- The stopped-database read above raises the 5xx proportion; record its
  status and duration and the resulting p95.
- Stopping the backend shows _DOWN — no current evidence_, and every rolling
  value becomes Unavailable rather than 0. After restart, rates stay positive.
- The **Interpret the observations** panel says latency is not Order
  processing time.

### HTTP-serving process (#172)

The unit suite scrapes the real exporter. It checks that the standard process
collectors are present with their Prometheus types. It checks that heap used ≤
heap total < resident memory, in bytes. 300 ms of busy work adds about 0.3
CPU seconds, not 300. A 250 ms event-loop block is reported as at least 0.2 s
of maximum delay, and the next scrape no longer reports it. The real Medusa
suite checks that the exporter started by the `register` hook reports the
Node process that serves the API (`nodejs_version_info` matches its
version). CPU seconds grow across 25 real product reads, and a booted
application's heap and resident memory are in bytes. Comparisons of request
series between scrapes now ignore process series, which change on every
scrape.

Agent verification on 20 November 2026, on the uncommitted #172 working tree:

| Boundary                | Observed result                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP/exporter      | **59 request-metrics unit tests passed**, four runs in a row, including the CPU and event-loop block cases.                                                                       |
| Dashboard queries       | **66 dashboard-query unit tests passed**: process panels state units and scope, gate on a current scrape, use `[5m]` and are in the promtool file verbatim.                       |
| Medusa HTTP suite       | **7 tests passed** in `request-metrics.spec.ts`, including the process collectors of the API-serving process.                                                                     |
| Prometheus query engine | **Not run by the agent.** The devcontainer had no Docker engine and downloading `promtool` was not permitted. Run the `test rules` command above; it holds six new process cases. |
| Grafana Viewer          | **Not run by the agent**, for the same reason. This is the developer's manual acceptance below.                                                                                   |

The promtool process cases cover a healthy target at 0.2 cores, DOWN (stale
series, nothing shown), an absent target beside an unrelated job's process,
one scrape (memory shown, no CPU rate), a collection gap inside the window
(0.2 cores and the post-recovery memory) and a restart that resets CPU seconds.

Repeat the startup above, run the `test rules` command, then check as a Viewer:

- The bottom row shows the **HTTP-serving process scope** panel naming
  `backend-metrics:9464`. It says CPU is cores, not host utilization, and
  lists what is not covered.
- After 30 seconds, CPU shows a small value in cores, memory in MB/GB with
  resident above heap total above heap used, and event-loop delay near
  0.01 s.
- During the burst above, CPU and event-loop p99 rise and fall back
  afterwards. Record the peak values here.
- Stopping the backend makes every process panel **Unavailable**, not its
  last value. After restart the CPU rate returns after two scrapes, without
  a negative dip.
- Check the row at 1440 and 390 pixels wide; units and long titles stay readable.

### Streams and interrupted requests (#173)

The unit suite drives real Node HTTP requests against the real exporter:
two established streams (active 2, then 1, then 0 as each client
disconnects, with one `disconnected` termination each), a stream the server
ends (`server_ended`), a refused stream (an ordinary 401, never active), an
interruption after a route matched and one before any route matched, and
30 requests whose client disconnects on the first byte, racing the server's
finish: completed plus interrupted is exactly 30, durations equal the
completed count and there is no 5xx. The real Medusa suite signs in as
synthetic staff and opens the real kitchen feed (active 1, then one
`disconnected` termination, ordinary series unchanged), and abandons a
`/store/regions` read that the test delays inside the process and then fails:
one interruption, no 200 or 500 and no duration for that route. Both new Medusa
tests fail against the previous collector.

Agent verification on 21 November 2026, on the uncommitted #173 working tree:

| Boundary                | Observed result                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP/exporter      | **66 request-metrics unit tests passed**; the race, lifecycle and server-ended cases passed three runs in a row.                                                                                               |
| Dashboard queries       | **112 dashboard-query unit tests passed**: the new panels are a stat and a chart each, gate on a current scrape, use `[5m]` and are in the promtool file verbatim; ordinary panels read no stream series.      |
| Medusa HTTP suite       | **9 tests passed** in `request-metrics.spec.ts`.                                                                                                                                                               |
| Prometheus query engine | `promtool test rules` with the pinned v3.16.0 image: **SUCCESS**. Four expected values written as `0.2` in earlier slices were corrected to the engine's `0.19999999999999998`; they had never been run.       |
| Compose demo            | Fresh build and migration. `observe-local-stream.js` held the feed 45 s: Prometheus read active 1 during the hold, then 0 and `disconnected` 1; ordinary series gained only the staff sign-in.                 |
| Interruption demo       | With PostgreSQL stopped, `curl --max-time 2` exited 28. The raw counter showed `GET unrouted` 1 and no 500 after PostgreSQL returned. The rolling value read 0 then, which led to the `GET unrouted` baseline. |
| Grafana 13.3.1 Viewer   | All six new queries returned data through Grafana's query API as the Viewer; saving the dashboard returned 403. The rendered row was then inspected; see the acceptance run below.                             |

Repeat the startup above, run the `test rules` command, then check as a Viewer:

- The **Streams and interrupted requests** row sits under the p95 charts, and
  its text says streams are not in the completed responses, interruptions have
  no HTTP status and a disconnect is not an application error.
- With no feed open, active reads 0 and terminations and interruptions 0, not
  Unavailable.
- During `observe-local-stream.js`, active reads 1. Afterwards, active is 0 and
  terminations show `disconnected`. The completed count, rate and p95 change
  only by the sign-in.
- The interruption demo adds one `GET unrouted` interruption and no 500.
- Stopping the backend makes the three stat values **Unavailable**; the three
  charts keep their history and draw no new points.
- Check the row at 1440 and 390 pixels wide; titles and legends stay readable.

Acceptance run on 21 November 2026, at the developer's request, on a fresh
Compose stack built from commit `add234c` (Grafana 13.3.1, signed in as
`local-viewer`, rendered in headless Chromium at 1440 and 390 pixels):

| Checklist item     | Observed result                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup            | Build, migration, `promtool check config` and `promtool test rules` succeeded.                                                                                                                                           |
| Row and text       | The row sits under the p95 charts. Its text panel was too short (height 4) and cut off the interruption sentences; it is now height 6 and the full text shows at 1440 pixels.                                            |
| No feed open       | Active, terminations and interruptions read 0, not Unavailable.                                                                                                                                                          |
| Kitchen feed (45s) | Active read 1 during the hold. Afterwards active read 0 and terminations showed one `disconnected`. Ordinary series gained only one completed `POST /auth/:actor_type/:auth_provider` with a 0.15 s duration.            |
| Interruption       | With PostgreSQL stopped, `curl` exited 28. Interrupted requests showed one `GET unrouted`; no 500 and no new duration, also after PostgreSQL returned.                                                                   |
| Backend stopped    | The three stat panels read **Unavailable**; the charts kept their history and drew no new points.                                                                                                                        |
| 1440 and 390 px    | Legends readable at both widths. At 390 pixels, stat titles are shortened with an ellipsis and the text panel shows its first lines with the rest scrollable inside the panel, as in the HTTP-serving process scope row. |

### Low-traffic indication per Viewer (#174)

No collection changed; the slice is the dashboard control, its query and the
Viewer journey. Agent verification on 23 November 2026, on the uncommitted
#174 working tree:

| Boundary                | Observed result                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard queries       | **146 dashboard-query unit tests passed**: the textbox default is `0`, the dashboard is not editable, the variable appears only as a quoted `percentencode` string, every state has a label and each of 24 Viewer input classes is in the promtool file as Grafana encodes it. Full unit suite: 832 passed. |
| Prometheus query engine | `promtool test rules` with the pinned v3.16.0 image: **SUCCESS**. Changing the comparison to "at or below" fails the two equality cases (100 and 750), so the file can detect an equality error.                                                                                                            |
| Grafana formatter       | The Grafana 13.3.1 build's `percentencode` is `encodeURIComponent` plus `!'()*` as `%XX`, as the unit test assumes.                                                                                                                                                                                         |
| Grafana 13.3.1 Viewer   | Signed in as `local-viewer` in headless Chromium with about 65 synthetic responses in five minutes. Results are listed below. Saving the dashboard returned 403 and the provisioned default stayed `0`.                                                                                                     |

| Viewer action                                                                                  | Indication                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plain URL (Git default)                                                                        | Off — threshold 0                                                                                                                                                        |
| URL value `5`                                                                                  | Not low                                                                                                                                                                  |
| URL values `100`, `750`, `999999999999999`                                                     | LOW traffic                                                                                                                                                              |
| URL values `1e3`, `-1`, `abc`, empty, `007`, `1.5`, `NaN`, `+5`, 16 digits, `100) or vector(1` | Configuration error                                                                                                                                                      |
| Typed `750`, then `1.5`, `100) or vector(1`, `0`                                               | LOW, error, error, Off; the URL carried each typed value                                                                                                                 |
| A second Viewer account (`local-viewer-2`, deleted afterwards) while the first had `750`       | Plain URL: `0`, Off. Typing `5` changed only its own view (count 0 then, so LOW); the first Viewer's reload kept `750`. Opening the first Viewer's URL reproduced `750`. |
| Backend stopped, values `0`, `100`, `abc`                                                      | Unavailable, Unavailable, Configuration error                                                                                                                            |
| 1440 and 390 pixels                                                                            | Labels readable, no horizontal overflow. The first, longer error label was too small at 390 pixels and was shortened.                                                    |

Repeat the startup above, run the `test rules` command, then check as a Viewer:

- The plain dashboard reads **Off — threshold 0**, with `0` in **Low traffic below**.
- Send reads, wait 30 seconds, then type a value below and one above
  **Estimated completed responses**: **Not low**, then **LOW traffic**. The
  URL shows each value.
- Type `1.5`, `-1`, `abc` and `100) or vector(1`, and open a URL with
  `var-low_traffic_threshold=1e3`: each shows **Configuration error**.
- Open the plain URL in another browser or private window: the box reads `0`.
  Open the copied URL there: the same value and result.
- Stop the backend: valid values read **Unavailable**, never LOW or Off.

Acceptance run on 23 November 2026, at the developer's request, on the stack
with the dashboard from commit `c208e0c` (Grafana 13.3.1, signed in as
`local-viewer`, rendered in headless Chromium at 1440 and 390 pixels). Reads
were spread over eight scrapes so the rolling count included them (about 50):

| Checklist item            | Observed result                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup                   | `promtool test rules` succeeded; Prometheus scraped the backend and the count rose to about 47.                                                                    |
| Plain dashboard           | **Off — threshold 0**, with `0` in **Low traffic below**.                                                                                                          |
| Below and above the count | Typed `10`: **Not low**. Typed `500`: **LOW traffic — read p95 with its observation count**. The URL showed `10`, then `500`.                                      |
| Invalid values            | Typed `1.5`, `-1`, `abc` and `100) or vector(1`, and opened `var-low_traffic_threshold=1e3`: each **Configuration error**, with the value kept in the box and URL. |
| Another window            | Plain URL: `0`, Off. The copied URL: `500`, LOW traffic.                                                                                                           |
| Backend stopped           | `0` and `500`: **Unavailable — no valid count**. `abc`: Configuration error.                                                                                       |
| 1440 and 390 pixels       | Labels readable, no horizontal overflow. The help text scrolls inside its panel at 390 pixels, like the other text panels.                                         |

The first plain-dashboard read in a new browser was taken before any panel
had loaded; repeated after eight seconds it showed Off.
