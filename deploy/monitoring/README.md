# Local request monitoring

The runbook, coverage limits, acceptance record and troubleshooting are in
[Local backend request monitoring](../../apps/docs/src/content/docs/quality/local-request-monitoring.md).

`compose.application.yaml` owns the disposable PostgreSQL/Medusa application.
`compose.yaml` independently owns Prometheus/Grafana and their volumes. Both
join the explicitly created internal `mtogo-local-metrics` network. Only the
API and Grafana have loopback host ports. There is no staging activation or
change to `deploy/staging/compose.yaml`.
