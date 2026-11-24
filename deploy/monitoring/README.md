# Request monitoring

The runbook, coverage limits, acceptance record and troubleshooting are in
[Local backend request monitoring](../../apps/docs/src/content/docs/quality/local-request-monitoring.md)
and, for the Droplet,
[Staging request monitoring](../../apps/docs/src/content/docs/quality/staging-request-monitoring.md).

## Local

`compose.application.yaml` owns the disposable PostgreSQL/Medusa application.
`compose.yaml` independently owns Prometheus/Grafana and their volumes. Both
join the explicitly created internal `mtogo-local-metrics` network. Only the
API and Grafana have loopback host ports.

## Query tests

`tests/dashboard-queries.test.yaml` is a `promtool test rules` file holding
every dashboard expression verbatim (the two traffic-indication queries with
each representative Viewer setting substituted as Grafana encodes it), evaluated against synthetic series:
healthy zero traffic, only 4xx, 5xx, DOWN and absent targets, insufficient
history, a missing duration histogram and a counter reset, and the
HTTP-serving process's CPU, memory and event-loop delay panels (healthy,
DOWN, absent, one scrape, a collection gap, CPU counter reset). It also covers the
stream and interruption panels (with idle ordinary traffic, quiet zero, DOWN,
one scrape and a counter reset), and the low- and high-traffic indications
for each class of each Viewer control and the cross-field bounds, encoded as
Grafana encodes them, against exact, boundary, zero, DOWN, absent and
one-scrape counts, and the Customer menu read and restaurant menu page panels
of #202 (a slow tail with idle parts and kinds, and no menu reads with the
storefront DOWN). The backend unit
test `src/observability/__tests__/dashboard-queries.unit.spec.ts` fails when a
dashboard query is not in that file. Change both together.

## Staging

`compose.staging.yaml` runs the same Prometheus configuration, data source and
dashboard on the Droplet, with memory caps and restart policies; its values
live in the staging `.env` (`deploy/staging/.env.template`). It joins the internal `mtogo-staging-metrics` network
that `deploy/staging/compose.yaml` creates for the backend and storefront
exporters. The local demo has no storefront, so the `mtogo-storefront` target
is DOWN there. Only
Grafana publishes a port, for Caddy, behind a login. The admin starts it with
`sudo mtogo-deploy.sh monitoring up`; deploys never touch it.
