---
title: Local backend request monitoring
description: Completed ordinary backend API responses, including early refusals, 5xx proportion and p95 latency, through a private exporter, Prometheus and a provisioned Grafana Viewer dashboard.
---

This implements the local journeys of
[#169](https://github.com/DannyShayH/MTGO/issues/169),
[#170](https://github.com/DannyShayH/MTGO/issues/170) and
[#171](https://github.com/DannyShayH/MTGO/issues/171), under
[#167](https://github.com/DannyShayH/MTGO/issues/167). It measures every
completed ordinary API response from one backend process, including
authentication, publishable-key and body refusals before application
middleware, with its server-side duration. It shows rates, five-minute
counts, the 5xx proportion and ordinary API p95, and states plainly when
evidence is unavailable. It does not count Customers or Orders, and HTTP
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

There is no application-log collection, process panels,
SSE/interruption counters or adjustable warning thresholds yet.
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
Open `http://127.0.0.1:3000/d/mtogo-backend-requests` (**MTOGO — backend API requests**). The provisioned dashboard
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
does not invent a completion or HTTP 500. IDs/query strings are discarded.

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

| Symptom                                            | Check/action                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target DOWN                                        | Check backend logs for the constant metrics warning, backend startup, port 9464 and the shared network alias. Never publish 9464 to fix connectivity.             |
| Raw 0 after read                                   | Confirm the read returned 200, the API uses `PORT=9000`, metrics is enabled and the next scrape occurred. Excluded paths and established streams are not counted. |
| Rolling count unavailable or surprising            | Wait for two scrapes; generate another request. Inspect raw count and `up`. Increases are estimates and new series lack earlier history.                          |
| Health is OK, scrape fails                         | API health and exporter availability are independent. Check exporter bind/configuration and private DNS.                                                          |
| Exporter warning                                   | Check port collision, a valid integer port and bind address. API startup continues; restart the backend after fixing configuration.                               |
| Grafana login fails after `.env` changes           | Stored credentials survive recreation. Restore the original local file or deliberately reset disposable volumes.                                                  |
| p95 or 5xx proportion Unavailable while UP         | Expected with no completed responses or no duration observations in five minutes. Check **Data state** and the observation count; send a real read.               |
| Data state shows Insufficient history              | Fewer than two successful scrapes in five minutes, for example right after Prometheus or the backend started. Wait 30 seconds.                                    |
| p95 shows exactly 10 s                             | The 95th percentile is in the overflow bucket: at least 10 s. Investigate the slow route in **p95 by route pattern**.                                             |
| `test rules` fails after a dashboard change        | Update the expression and expected values in `tests/dashboard-queries.test.yaml` together; the backend unit test names any query the file lacks.                  |
| Dashboard absent                                   | Check Grafana provisioning logs and the mounted dashboard/provider/data-source paths; keep the pinned versions together.                                          |
| `docker: command not found`                        | Rebuild and reopen the devcontainer with the Docker-in-Docker feature, then check `docker version` and `docker compose version`.                                  |
| Docker client exists but cannot reach its server   | Check the feature startup log `/tmp/dockerd.log` and host support for privileged development containers; a client alone cannot run the journey.                   |
| No configuration file found                        | Run the monitoring commands from `deploy/monitoring`, not the repository root.                                                                                    |
| PostgreSQL refuses `localhost:5432` for HTTP tests | Rebuild the repository devcontainer. Do not redirect tests to `postgres`, which causes Medusa SSL problems. The Compose demo owns a separate database.            |

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
now titled **MTOGO — backend API requests**, and record their own acceptance on
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
