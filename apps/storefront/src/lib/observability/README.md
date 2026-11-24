# Storefront page render metrics

Server-side render time of the Restaurant menu page, so the monitoring
dashboard shows what a Customer waits for beyond the backend menu read (#202).
It follows the backend exporter's pattern (#194,
`apps/backend/src/observability/README.md`): an isolated Prometheus registry,
Node's `http.server.request.start` diagnostics channel and a separate private
listener that serves only `GET /metrics`.

`src/instrumentation.ts` starts it when Next.js starts the Node.js server, only
with `MTOGO_METRICS_ENABLED=1`. The listener defaults to `127.0.0.1:9465`;
staging binds it to `storefront-metrics` on the internal
`mtogo-staging-metrics` network without publishing the port, and there is no
Caddy route. The measured app port is `PORT` (default 8000). An invalid
configuration or a bind failure logs a constant warning and the storefront
keeps serving.

`mtogo_storefront_page_render_duration_seconds{route,kind}` is a histogram of
the seconds from request start to response `finish` (the last streamed byte),
with the backend's buckets. `route` is the fixed App Router pattern
`/[countryCode]/restaurants/[id]`, matched on the raw path; the Restaurant id
and query string are never labels. `kind` says how the browser asked:

- `document`: a full page load (GET).
- `navigation`: a client-side navigation (GET with the `RSC` header).
- `prefetch`: a link prefetch (`Next-Router-Prefetch`).
- `action`: a server action, such as a basket change, that answers with a fresh
  render of the page (POST with `Next-Action`).

Other methods and paths, redirects (3xx, such as the region middleware's),
renders whose connection closed first and requests on other listeners are not
observed. Error pages (4xx, 5xx) are renders the Customer waits for and are
counted. Every kind starts at zero. The page reads the
menu fresh on every render (ADR-0012), so many `action` renders mean basket
changes are re-reading the menu.

Run `npm test` in `apps/storefront`; the tests drive a real HTTP server and
scrape the real exporter.
