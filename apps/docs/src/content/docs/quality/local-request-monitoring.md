---
title: Local backend request monitoring
description: A disposable Medusa product read through a private exporter, Prometheus and a provisioned Grafana Viewer dashboard.
---

This implements the first local journey of
[#169](https://github.com/DannyShayH/MTGO/issues/169), under
[#167](https://github.com/DannyShayH/MTGO/issues/167). It measures completed HTTP
responses from one backend process on `/store/products` and
`/store/products/:id`, including early refusals on those paths. It does not
represent all backend traffic, Customers or Orders. Business state, logging
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

This slice has no application-log collection, latency/process panels,
SSE/interruption counters, whole-API coverage or adjustable warning thresholds.
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
Open `http://127.0.0.1:3000/d/mtogo-backend-requests`. The provisioned dashboard
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

## Interpret the view

`mtogo_http_requests_total{method,route,status}` increments only after response
`finish`. A subsequent close does not add a duplicate. An interrupted response
does not invent a completion or HTTP 500. IDs/query strings are discarded;
route labels are the two constants above, and methods use a fixed allowlist
plus OTHER. Health, exporter, Admin/static and other routes are excluded.

Queries apply `increase(...[5m])` or `rate(...[5m])` **before** summing series,
which handles counter resets. The first successful-list series has a zero
baseline. Other outcomes appear when observed; Prometheus cannot recover an
unseen series' first increment. Missing history or fewer than two samples can
leave rolling values unavailable. Raw process counters are the acceptance
oracle for an exact first response. See the
[Prometheus query function semantics](https://prometheus.io/docs/prometheus/latest/querying/functions/).

Traffic queries require a successful `up` sample within the 15-second scrape
interval. The dedicated Prometheus instance sets its instant-selector lookback
to that interval so old samples expire through collection outages. Failed or
missing scrapes yield unavailable traffic. Plots leave gaps at the chart's
query resolution. `up` describes scrape availability. Allow one scrape plus
dashboard refresh for a failure to appear. Backend restart resets its raw count.

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
app would leave collection unavailable; this slice does not activate rollback
or persistence guarantees on staging.

To stop this demonstration, run both `down` commands without `--volumes`.
Only when intentionally discarding **local synthetic history**, add
`--volumes` to each command and remove the unused shared network. Delete the
ignored `.env` only when resetting both databases too.

```bash
docker compose -f compose.application.yaml down
docker compose down
```

## Troubleshooting

| Symptom                                            | Check/action                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Target DOWN                                        | Check backend logs for the constant metrics warning, backend startup, port 9464 and the shared network alias. Never publish 9464 to fix connectivity.  |
| Raw 0 after read                                   | Confirm the read returned 200, the API uses `PORT=9000`, metrics is enabled and the next scrape occurred. Other routes are intentionally excluded.     |
| Rolling count unavailable or surprising            | Wait for two scrapes; generate another request. Inspect raw count and `up`. Increases are estimates and new series lack earlier history.               |
| Health is OK, scrape fails                         | API health and exporter availability are independent. Check exporter bind/configuration and private DNS.                                               |
| Exporter warning                                   | Check port collision, a valid integer port and bind address. API startup continues; restart the backend after fixing configuration.                    |
| Grafana login fails after `.env` changes           | Stored credentials survive recreation. Restore the original local file or deliberately reset disposable volumes.                                       |
| Dashboard absent                                   | Check Grafana provisioning logs and the mounted dashboard/provider/data-source paths; keep the pinned versions together.                               |
| `docker: command not found`                        | Rebuild and reopen the devcontainer with the Docker-in-Docker feature, then check `docker version` and `docker compose version`.                       |
| Docker client exists but cannot reach its server   | Check the feature startup log `/tmp/dockerd.log` and host support for privileged development containers; a client alone cannot run the journey.        |
| No configuration file found                        | Run the monitoring commands from `deploy/monitoring`, not the repository root.                                                                         |
| PostgreSQL refuses `localhost:5432` for HTTP tests | Rebuild the repository devcontainer. Do not redirect tests to `postgres`, which causes Medusa SSL problems. The Compose demo owns a separate database. |

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

No staging capacity, combined four-component budget or activation acceptance is
claimed by this local slice.
