# Request monitoring

The runbook, coverage limits, acceptance record and troubleshooting are in
[Local backend request monitoring](../../apps/docs/src/content/docs/quality/local-request-monitoring.md)
and, for the Droplet,
[Staging request monitoring](../../apps/docs/src/content/docs/quality/staging-request-monitoring.md).

## Local

`compose.application.yaml` owns the disposable PostgreSQL/Medusa application
and the partner app.
`compose.yaml` independently owns Prometheus, Grafana, Loki, Alloy, Node
Exporter and their volumes. Both
join the explicitly created internal `mtogo-local-metrics` network. Only the
API, the partner app and Grafana have loopback host ports.

## Approved application events (#176, #177)

`alloy/approved-events.alloy` is the Loki dataset boundary: it keeps only
recognized `@dtc/logging` records from the backend, partner and storefront,
each only from its own container, and rebuilds them from allowlisted fields.
`alloy/config.alloy` feeds it from the `backend`, `partner` and `storefront`
containers of the project in `MTOGO_LOG_PROJECT`, labelled with their Compose
service; `loki/config.yaml` stores the result with the labels `service`, `env`
and `level`. `tests/log-pipeline/` runs the module against the pinned Loki with
fixtures (`cases.json`, one file per source container) and checks the stored
records. The local demo runs the partner (`compose.application.yaml`) but not
the storefront. The runbook is
[Approved application events in Grafana](../../apps/docs/src/content/docs/quality/approved-application-events.md).
On staging, Loki and Alloy run only with `STAGING_LOGS_ENABLED=1`.

### History (#178)

Alloy imports approved records of the last seven days from what Docker still
has, resumes from positions in `alloy-data`, and Loki's Compactor applies
seven-day retention in `loki-data`. Docker's rotation of the source logs is
separate. `tests/log-history/check.mjs` demonstrates first import, resume,
replacement, rotation and retention on disposable containers; the limits are in
the runbook's history section.

### Pipeline health (#179)

Prometheus scrapes Alloy and Loki on the internal `logs` network and keeps only
the series that the events dashboard shows: lines read, read errors, events
delivered, drops, retries, Docker listing failures and what Loki refused. Alloy's
retries are bounded in `alloy/config.alloy`, and its queue by Alloy's default,
which cannot be changed at the default stability level.
`tests/log-outage/check.mjs` stops Loki, Alloy, Prometheus and Grafana on
disposable containers while stand-in applications keep answering; the meaning of
each state and the loss limits are in the runbook's health section.

`tests/disposable-project.mjs` and `tests/record-line.cjs` are shared by the two checks.

## Host (#182)

Node Exporter (`node-exporter:9100`) reads the host's CPU, load, memory,
swap and free disk for the **Host** row. It shares the internal `host-metrics` network with
Prometheus only, publishes no port and mounts no host folder: `/etc/hostname`
stands for the root file system and an empty volume for the disk of the Docker
volumes, both read-only. Prometheus keeps only the series the row shows.
`tests/disk-check/compose.yaml` puts a disposable volume in place of the second
one, to fill it locally. `host-metrics.unit.spec.ts` in the backend guards the
configuration; the meaning of each panel and the rollback are in
[staging request monitoring](../../apps/docs/src/content/docs/quality/staging-request-monitoring.md#host-cpu-memory-and-disk).

## Query tests

`tests/dashboard-queries.test.yaml` is a `promtool test rules` file holding
every Prometheus expression of both dashboards verbatim (the two traffic-indication queries with
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
storefront DOWN), and the log pipeline panels of #179 (collecting, quiet, Alloy
or Loki DOWN, dropping, retrying, Docker unreachable, read errors, one scrape, missing
scrapes, recovered and absent), and the Host row of #182 (CPU and load, healthy, at each
threshold, DOWN, absent, one scrape, no swap, a full disk and an unreadable
disk), and its two range stats of #183 (a dip inside and a deeper one outside
the displayed range, DOWN for part of it with an older value still within the
lookback, DOWN for all of it, and no swap). The backend unit
tests `dashboard-queries.unit.spec.ts` and `log-pipeline-health.unit.spec.ts` in
`src/observability/__tests__/` fail when a dashboard query is not in that file. Change both together.

## Staging

`compose.staging.yaml` runs the same Prometheus configuration, data source and
dashboard on the Droplet, with memory caps and restart policies; its values
live in the staging `.env` (`deploy/staging/.env.template`). It joins the internal `mtogo-staging-metrics` network
that `deploy/staging/compose.yaml` creates for the backend and storefront
exporters. The local demo has no storefront, so the `mtogo-storefront` target
is DOWN there. Without `STAGING_LOGS_ENABLED=1` the `mtogo-alloy` and
`mtogo-loki` targets are DOWN on staging. Only
Grafana publishes a port, for Caddy, behind a login. The admin starts it with
`sudo mtogo-deploy.sh monitoring up`; deploys never touch it.

## Releases and rollback (#180)

Monitoring is its own Compose project, with its configuration installed in
`/srv/mtogo-monitoring/config` by `monitoring update` and kept there through
deploys and rollback; plain `monitoring up` reuses it. Its volumes belong to
that project, so application deploys and rollback never remove them; only
`down --volumes` on the monitoring project does. Releases attach to it only
through the scrape network, which every release defines identically. A rollback
to a release without the exporter shows the target DOWN while the history
stays. `compose.uninstrumented.yaml` stands in for such a release in the local
rehearsal: no exporter, not on the scrape network.
`monitoring-lifecycle.unit.spec.ts` in the backend guards the configuration;
the rehearsal is the runtime check. The local rehearsal is in
[local request monitoring](../../apps/docs/src/content/docs/quality/local-request-monitoring.md#release-and-rollback-rehearsal-180),
the staging behaviour in
[staging request monitoring](../../apps/docs/src/content/docs/quality/staging-request-monitoring.md#releases-and-rollback).
