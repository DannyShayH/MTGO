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
every dashboard expression verbatim, evaluated against synthetic series:
healthy zero traffic, only 4xx, 5xx, DOWN and absent targets, insufficient
history, a missing duration histogram and a counter reset. The backend unit
test `src/observability/__tests__/dashboard-queries.unit.spec.ts` fails when a
dashboard query is not in that file. Change both together.

## Staging

`compose.staging.yaml` runs the same Prometheus configuration, data source and
dashboard on the Droplet, with memory caps and restart policies; its values
live in the staging `.env` (`deploy/staging/.env.template`). It joins the internal `mtogo-staging-metrics` network
that `deploy/staging/compose.yaml` creates for the backend exporter. Only
Grafana publishes a port, for Caddy, behind a login. The admin starts it with
`sudo mtogo-deploy.sh monitoring up`; deploys never touch it.
