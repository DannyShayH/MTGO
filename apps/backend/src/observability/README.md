# Backend request metrics

Owns an isolated Prometheus registry, the Node HTTP diagnostics subscription
and a separate private exporter. Medusa 2.22.4 calls the backend root
`instrumentation.ts` hook for `start`/`develop` before serving HTTP. Importing
the runtime alone has no side effects. Migrations, builds and `medusa exec`
do not invoke that hook. Worker mode and Node cluster children skip it.

Monitoring is opt-in with `MTOGO_METRICS_ENABLED=1`. The listener defaults to
`127.0.0.1:9464`; only `GET /metrics` exposes Prometheus text format 0.0.4.
The disposable container setup and staging (`STAGING_METRICS_ENABLED=1`) bind
it to an internal network alias without publishing this port.
An invalid configuration or exporter bind failure warns with constant text and
leaves application startup usable. Shutdown removes subscriptions, pending
response listeners and signal handlers and closes exporter connections.

The initial supported runtime is one HTTP process with `PORT` (default 9000)
matching the API listener; CLI `--port` overrides and cluster mode are outside
this slice. The process-wide diagnostics subscriber filters by that listener's
local port, so other HTTP servers are excluded. The built-in Node diagnostic
channel is experimental; retain HTTP-boundary tests when upgrading Node.

`mtogo_http_requests_total{method,route,status}` counts every completed
ordinary API response once on `finish`, using the final status. The
diagnostics channel fires before Express runs, so refusals by namespace
middleware are included. `route` is Express's documented `req.route.path` at
completion: the last registered pattern that matched, such as
`/store/products/:id`. The set is bounded by the application's registrations.
Medusa applies publishable-key, namespace authentication, body parsing, CORS
and every `defineMiddlewares` entry without `method` with `app.use`, before any
route matches. A response finished there uses a fixed category: `unmatched` for
404, `early_rejection` for other statuses of 400 or above, and `unrouted`
for a success such as a CORS preflight. Route-level middlewares that declare
methods, such as body validation, keep their pattern. A refusal by a wildcard route middleware shows that wildcard, not
the exact endpoint, so a label is not always the final route file. Methods are
GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS or OTHER. Raw IDs, URLs, headers
and query strings are never labels. Node validates emitted HTTP status codes.

Health probes, `/metrics`, `/app` Admin pages and assets, `/static` files and
scrapes on the exporter listener are excluded by raw path. Established SSE
streams (a 2xx on a listed stream endpoint, currently
`/partner/orders/stream`) are excluded explicitly. A stream request refused
before establishment keeps its ordinary outcome. Add new SSE endpoints to the
stream list. Interrupted responses are excluded from this counter. Separate
interruption, SSE and runtime measurements belong to later slices.

`mtogo_http_request_duration_seconds{method,route}` is a histogram of the
server-side seconds from the diagnostics channel's request start to response
`finish`, observed once for exactly the responses the counter counts, with the
same `method` and `route` labels (no status, to keep the series bounded).
Buckets are `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10` and
`+Inf`: subsecond resolution, the agreed two-second browsing/status and
five-second Order-submission boundaries, one bucket above five seconds and
overflow. Interrupted responses, excluded paths and established streams add
no duration. The `GET /store/products` histogram starts at zero, so "no
observations" exports a zero count rather than a missing series. This is HTTP
latency, not Order processing time (Feature #54).

The successful product-list series starts at zero so a pre-request scrape can
establish a baseline. Other status series appear on first observation. Counter
resets follow process restarts; five-minute `increase`/`rate` queries operate
per series before aggregation, and require sufficient scrape history. They
cannot recover responses between scrapes or an unseen series' first increment.

The [local monitoring runbook](../../../docs/src/content/docs/quality/local-request-monitoring.md)
owns setup and the acceptance record. Unit tests exercise real Node HTTP and
exporter boundaries; `integration-tests/http/request-metrics.spec.ts` uses the
real Medusa HTTP runner and the same instrumentation hook, driving genuine
authentication, missing-key, malformed-body and invalid-body refusals, and a
controlled 5xx: the test makes the region module's read reject once inside
the process, so the real `/store/regions` route and Medusa's error handler
answer 500. No public crash endpoint exists. Existing business
and request-logging behavior is unchanged.
