# Backend request metrics

Owns an isolated Prometheus registry, the Node HTTP diagnostics subscription
and a separate private exporter. Medusa 2.22.4 calls the backend root
`instrumentation.ts` hook for `start`/`develop` before serving HTTP. Importing
the runtime alone has no side effects. Migrations, builds and `medusa exec`
do not invoke that hook. Worker mode and Node cluster children skip it.

Monitoring is opt-in with `MTOGO_METRICS_ENABLED=1`. The listener defaults to
`127.0.0.1:9464`; only `GET /metrics` exposes Prometheus text format 0.0.4.
The disposable container setup binds internally without publishing this port.
An invalid configuration or exporter bind failure warns with constant text and
leaves application startup usable. Shutdown removes subscriptions, pending
response listeners and signal handlers and closes exporter connections.

The initial supported runtime is one HTTP process with `PORT` (default 9000)
matching the API listener; CLI `--port` overrides and cluster mode are outside
this slice. The process-wide diagnostics subscriber filters by that listener's
local port, so other HTTP servers are excluded. The built-in Node diagnostic
channel is experimental; retain HTTP-boundary tests when upgrading Node.

`mtogo_http_requests_total{method,route,status}` counts once on response `finish`
using final status, including parser and publishable-key refusals. Only the
constant `/store/products` and `/store/products/:id` categories are emitted.
Methods are GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS or OTHER. Raw IDs,
URLs, headers and query strings are never labels. Node validates emitted HTTP
status codes. Health probes, static/Admin assets, scrapes and other endpoints
are excluded by the route allowlist. Interrupted responses are excluded from
this counter; separate interruption/SSE/latency/runtime measurements belong to
later slices. Product endpoints do not establish SSE streams.

The successful product-list series starts at zero so a pre-request scrape can
establish a baseline. Other status series appear on first observation. Counter
resets follow process restarts; five-minute `increase`/`rate` queries operate
per series before aggregation, and require sufficient scrape history. They
cannot recover responses between scrapes or an unseen series' first increment.

The [local monitoring runbook](../../../docs/src/content/docs/quality/local-request-monitoring.md)
owns setup and the acceptance record. Unit tests exercise real Node HTTP and
exporter boundaries; `integration-tests/http/request-metrics.spec.ts` uses the
real Medusa HTTP runner and the same instrumentation hook. Existing business
and request-logging behavior is unchanged.
