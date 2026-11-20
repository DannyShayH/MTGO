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

## Staging

`compose.staging.yaml` runs the same Prometheus configuration, data source and
dashboard on the Droplet, with memory caps and restart policies; its values
live in the staging `.env` (`deploy/staging/.env.template`). It joins the internal `mtogo-staging-metrics` network
that `deploy/staging/compose.yaml` creates for the backend exporter. Only
Grafana publishes a port, for Caddy, behind a login. The admin starts it with
`sudo mtogo-deploy.sh monitoring up`; deploys never touch it.
