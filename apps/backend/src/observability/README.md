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
scrapes on the exporter listener are excluded by raw path.

Each observed request settles exactly once, on the first of response `finish`
or `close`: a completed response, an interrupted request or a stream
termination. The listener for the other event is removed, and a `close`
after a finished response (`writableFinished`) is still that completion, so a
finish/close race never adds a second outcome.

Server-sent event (SSE) endpoints are listed in `STREAM_ROUTES` with a fixed
route label, currently `/partner/orders/stream` and `/partner/deliveries/stream`. Add new SSE endpoints there.
A stream is **established** once its 2xx headers have been sent. Established
streams never enter `mtogo_http_requests_total`, the duration histogram or
the interruption counter:

- `mtogo_sse_connections_active{route}` is a gauge computed on each scrape from
  the stream responses still open with established headers. It follows the
  real connection lifecycle; there is no separate increment to drift.
- `mtogo_sse_connections_closed_total{route,outcome}` counts each established
  stream once when it ends: `server_ended` when the response finished (session
  expiry, revoked access, a feed error) and `disconnected` when the
  connection closed first. A disconnect is not an application error.

A stream request refused before establishment (for example 401) is an
ordinary completed response with its final status. A stream whose client
leaves before any headers were sent is an ordinary interruption.

`mtogo_http_requests_interrupted_total{method,route}` counts an ordinary
request whose connection closed before its response finished. It has no status
label and observes no duration, and a late error after the disconnect cannot
add a 500 because the request has already settled. `route` is the matched
pattern when Express had matched one, otherwise `unrouted`. The
`GET /store/products` and `GET unrouted` interruption series and every stream route/outcome start
at zero.

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

The same registry runs the client's standard `collectDefaultMetrics`
collectors for the HTTP-serving process, without a prefix or extra labels:
`process_cpu_seconds_total` (user plus system CPU seconds since the exporter
started; a rate is cores used, not host utilization),
`process_resident_memory_bytes`, `nodejs_heap_size_{used,total}_bytes` and
`nodejs_eventloop_lag_{min,max,mean,stddev,p50,p90,p99}_seconds`. The delay
statistics come from `perf_hooks.monitorEventLoopDelay` at 10 ms resolution:
the time between sampling ticks, so a healthy process reads about 0.01 s and
only time above that is delay. They reset on every scrape, so they cover the
window since the previous scrape.
Node needs one sample after a reset, so a block starting within about 10 ms of
a scrape can go unreported. The client's other default series (CPU user/system
split, virtual memory, process heap, start time, external memory,
`nodejs_eventloop_lag_seconds`, GC, handles, resources, file descriptors,
heap spaces, event-loop utilization, version)
are bounded and exported but not on the dashboard. The client offers no
teardown for its event-loop monitor, GC observer and 100 ms utilization
timer. They do not keep the process alive and stop at process exit; `stop` clears the registry,
so their series disappear. Separate-worker, Next.js, host, container,
database and Redis runtimes are not covered.

`mtogo_menu_read_part_duration_seconds{part}` (`menu-read-timing.ts`, #202)
times each part of the Customer menu read step `readRestaurantMenuStep`:
`restaurant` (Restaurant, categories, dish ids), `dish_prices` (dishes with
calculated prices), `photos` (dish photo records and the cover URL),
`photo_urls` (signing the published dishes' photo URLs), `food_information`
(the kept allergen and label catalogue) and the `whole_read`, with the same
buckets as the route histogram (`duration-buckets.ts`). `part` is the only
label. Every part starts at zero. The histogram is process-wide and the step
observes it whether or not the exporter runs; only the exporter's registry
exposes it. `dish_prices` and `photos` run at the same time, so the parts can
add up to more than the whole read. `whole_read` counts only reads that
answer with a menu: a missing or inactive Restaurant, or a failed query, adds
no `whole_read`, while the route histogram counts it. A whole read over one
second also logs one `menu.read.slow` record (`@dtc/logging`, ADR-0019) with
each part in whole milliseconds and the dish and photo counts, never an ID.

The [local monitoring runbook](../../../docs/src/content/docs/quality/local-request-monitoring.md)
owns setup and the acceptance record. Unit tests exercise real Node HTTP and
exporter boundaries; `integration-tests/http/request-metrics.spec.ts` uses the
real Medusa HTTP runner and the same instrumentation hook, driving genuine
authentication, missing-key, malformed-body and invalid-body refusals, and a
controlled 5xx: the test makes the region module's read reject once inside
the process, so the real `/store/regions` route and Medusa's error handler
answer 500. No public crash endpoint exists. Existing business
and request-logging behavior is unchanged.
