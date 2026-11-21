---
title: Staging request monitoring
description: Private Prometheus and Grafana beside the staging application on the Droplet, with a login-protected Viewer dashboard, memory readings and rollback.
---

This is issue [#194](https://github.com/DannyShayH/MTGO/issues/194), part of
[#167](https://github.com/DannyShayH/MTGO/issues/167). It runs the request
metrics from [local monitoring](/MTGO/quality/local-request-monitoring/)
(#169 and #170) on the staging Droplet, so the team can look at real staging
traffic before deciding on the log pipeline. It adds Prometheus and Grafana
only: no Loki and no Alloy. The full four-component capacity gate and
acceptance remain [#183](https://github.com/DannyShayH/MTGO/issues/183) and
[#184](https://github.com/DannyShayH/MTGO/issues/184).

**Status:** prepared in the repository. The repository admin performs every
Droplet step below. Agents change repository files only and never connect to
the Droplet. Setup is one `.env` edit, one command, one Caddy block and one
command per Viewer.

## Access model

| Component        | Where it listens                                          | Reachable from                                                                |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Backend exporter | `backend-metrics:9464` on `mtogo-staging-metrics`         | Prometheus only. No published port, no Caddy route. The API's `/metrics` 404s |
| Prometheus 3.16  | `prometheus:9090` on `mtogo-staging-metrics`              | Grafana only. No published port, no Caddy route                               |
| Grafana 13.3     | `STAGING_BIND_ADDRESS:STAGING_GRAFANA_PORT` (port `3300`) | Caddy over HTTPS at the Grafana hostname, with a login                        |

`mtogo-staging-metrics` is an internal Docker network: no published ports and
no internet. Grafana has a login for every person. Anonymous access, sign-up,
organisation creation, public dashboards and external snapshots are off.
Grafana's brute-force login protection is on, and the session cookie is
`Secure` and `SameSite=Strict`. Everyone on the team gets an individual
**Viewer** account, who sees the provisioned dashboard and cannot change it or
its data source.

The admin creates and removes Viewers with the deploy script on the Droplet,
which calls Grafana on its bind address. Caddy answers 404 for Grafana's
server administration pages and APIs (`/admin`, `/api/admin`). This narrows
the public surface but does not fence off the `staging-admin` account: it can
still sign in on the public hostname and use organisation-level user,
data-source and dashboard APIs. Its long generated password and the
brute-force lockout are its real protection. Never share it or use it for
viewing.

:::note[Change from the issue text]
Issue #194 proposed an SSH tunnel for every Viewer and no Caddy route. On
20 November 2026 the developer chose a public, login-protected Grafana instead:
staging holds synthetic data only, the dashboard shows request counts only,
and team members should not need Droplet SSH access to look at it. Prometheus
and the exporter remain unreachable from the internet, as the issue requires.
Update the issue's acceptance criteria to match before acceptance.
:::

## Files

| Repository file                          | Role                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `deploy/monitoring/compose.staging.yaml` | Project `mtogo-staging-monitoring`: Prometheus and Grafana with memory caps and named volumes            |
| `deploy/monitoring/prometheus.yaml`      | Scrape target `backend-metrics:9464`, the same file the local demo uses                                  |
| `deploy/monitoring/grafana/`             | Provisioned data source and the read-only dashboard `mtogo-backend-requests`, shared with the local demo |
| `deploy/staging/compose.yaml`            | Creates `mtogo-staging-metrics`, attaches the backend; `STAGING_METRICS_ENABLED=1` turns the exporter on |
| `deploy/staging/.env.template`           | `STAGING_METRICS_ENABLED`, `STAGING_GRAFANA_URL`, `STAGING_GRAFANA_PORT`, `GRAFANA_ADMIN_PASSWORD`       |
| `deploy/staging/mtogo-deploy.sh`         | `monitoring up`, `down`, `status`, `viewer-add` and `viewer-remove`, for administrators only             |
| `deploy/staging/Caddyfile.example`       | The Grafana site block                                                                                   |

The monitoring stack is a separate Compose project. Deploys (`prepare`,
`release`, `rollback`) never start, stop or recreate it, and the CI identity
cannot run `monitoring`. `monitoring up` copies `deploy/monitoring/` out of
the live backend image into `/srv/mtogo-monitoring/config`, so the
configuration always matches a reviewed release and the Droplet needs no Git
checkout. The backend's exporter counts the same responses as locally:
browser calls through Caddy, server-side calls from the storefront and the
partner app, and early refusals. A split staging worker serves no HTTP and is
not scraped.

## Memory budget

The idle snapshot on 20 November 2026: 1,963 MB RAM, 883 MB available,
194 MB of 2,047 MB swap in use; the four MTOGO containers use about 494 MiB.

| Container  | Hard cap | Go memory limit | Persistent state                                 |
| ---------- | -------- | --------------- | ------------------------------------------------ |
| prometheus | 192 MB   | 160 MiB         | Volume `prometheus-data`: 7 days, at most 512 MB |
| grafana    | 448 MB   | 220 MiB         | Volume `grafana-data`: users, sessions           |

The caps add at most 640 MB. Grafana's first cap of 256 MB (Go limit 220 MiB)
was too small for Grafana 13: on 20 November 2026 it sat at 99% of the cap
with 28% CPU, spending its time on garbage collection, and pages took 3 to
90 seconds or failed with 500. It was not killed. With the cap raised to
384 MB (Go limit unchanged) it settled at 326 MiB and 1.5% CPU, and health
answered in 0.11 s: about 100 MiB of Grafana's use is outside the Go heap. The
cap is now 448 MB with the Go limit kept at 220 MiB, leaving roughly 120 MiB
of headroom over that reading. Each cap also limits swap (`memswap_limit` equals
the memory limit), so a container cannot grow into the host's swap. The Go
memory limits make both collect garbage before the kernel enforces the cap.
The tightest moment is a deploy: the migration container and the new backend
run next to the old one.

**Proposed floor (agree with the team before activation):** `available` in
`free -m` stays at **200 MB or more** at every reading, including during a
deploy. If a reading falls below the floor, or `dmesg` shows an out-of-memory
kill, roll back the monitoring stack (below) and reopen the hosting question
with the team in #183.

## Activation (repository admin)

Commands run on the Droplet as an administrator account with sudo. Never paste
passwords into an issue, a commit or diagnostic output.

### 1. Before you start

- Deliver #194 and wait until the Deploy workflow has put it live
  (`sudo mtogo-deploy.sh status`).
- Re-install `mtogo-deploy.sh` from that commit, as in
  [staging deployment, step 4](/MTGO/quality/staging-deployment/#4-scripts).
  The `monitoring` command is new.
- Add a DNS `A` record for the Grafana hostname, pointing at the Droplet.
- Take the memory reading before activation, for the
  [acceptance record](#manual-acceptance-record):

```bash
free -m
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
```

### 2. Values

Add four lines to `/srv/mtogo-staging/.env` (see `deploy/staging/.env.template`).
`STAGING_BIND_ADDRESS` is reused for Grafana's port. Store the admin password
in the team's password manager. Grafana reads it only on its first start.

```bash
openssl rand -hex 24          # the GRAFANA_ADMIN_PASSWORD value
sudoedit /srv/mtogo-staging/.env
```

```text
STAGING_METRICS_ENABLED=1
STAGING_GRAFANA_URL=https://grafana.staging.example.org
STAGING_GRAFANA_PORT=3300
GRAFANA_ADMIN_PASSWORD=<the generated value>
```

### 3. Start

```bash
sudo mtogo-deploy.sh monitoring up
```

It refuses to run unless `STAGING_METRICS_ENABLED=1` and both Grafana values
are set. Then it:

1. Recreates the backend with the exporter on, if its setting changed. The
   API restarts for about a minute; the storefront and partner app keep running.
2. Copies `deploy/monitoring/` from the live release to
   `/srv/mtogo-monitoring/config`.
3. Checks the Compose file and `promtool check config`.
4. Starts (or recreates) Prometheus and Grafana and prints their status.

Run it again whenever a later release changes `deploy/monitoring/`. Named
volumes keep history and accounts.

### 4. Caddy

Add the Grafana block from `deploy/staging/Caddyfile.example` to the existing
Caddy configuration with the real hostname, then reload Caddy the way the
existing stack does. The upstream is `STAGING_BIND_ADDRESS:STAGING_GRAFANA_PORT`:
with Caddy in a container, that is the `docker0` gateway, as for the
application blocks. Keep the `@server_admin` matcher. Do not add a route for
Prometheus or the exporter. The firewall stays at 22, 80 and 443.

```text
grafana.staging.example.org {
	encode gzip
	@server_admin path /admin /admin/* /api/admin/*
	respond @server_admin 404
	reverse_proxy 172.17.0.1:3300
}
```

### 5. Admin sign-in and Viewer accounts

The admin account is `staging-admin`, with the `GRAFANA_ADMIN_PASSWORD` from
`/srv/mtogo-staging/.env`. Sign in at `https://<grafana hostname>/login`. Use it
only for checks the Viewer cannot do; Caddy answers 404 for the server
administration pages, so manage people with the commands below, not in the UI.

One command per team member. It prints a generated first password once; hand
it over through the password manager, not chat or an issue. Each person then
changes it under **Profile → Change password**.

```bash
sudo mtogo-deploy.sh monitoring viewer-add <login>
sudo mtogo-deploy.sh monitoring viewer-remove <login>   # when someone leaves
```

### 6. Check privacy and the Viewer

From your own machine (outside the Droplet):

```bash
curl -s -o /dev/null -w '%{http_code} api /metrics\n'    https://api.staging.example.org/metrics
curl -s -o /dev/null -w '%{http_code} grafana health\n'  https://grafana.staging.example.org/api/health
curl -s -o /dev/null -w '%{http_code} admin API\n'       https://grafana.staging.example.org/api/admin/users
curl -s -o /dev/null -w '%{http_code} anonymous query\n' https://grafana.staging.example.org/api/datasources/uid/mtogo-prometheus
nc -vz -w 5 <droplet-ip> 3300; nc -vz -w 5 <droplet-ip> 9090; nc -vz -w 5 <droplet-ip> 9464
```

Expected: `404`, `200`, `404`, `401`, and all three `nc` attempts fail. On the
Droplet, only Grafana's port is bound on the host, and only on the bind
address:

```bash
sudo ss -tlnp | grep -E ':(3300|9090|9464)\b'
```

Then sign in at the Grafana hostname as a Viewer and open the dashboard
**MTOGO → MTOGO — backend API requests and process**. Generate an early rejection and an
unknown URL from your machine:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.staging.example.org/admin/orders/order_synthetic
curl -s -o /dev/null -w '%{http_code}\n' https://api.staging.example.org/store/products
curl -s -o /dev/null -w '%{http_code}\n' https://api.staging.example.org/no-such-route
```

Expected after the next scrape and refresh (up to 45 seconds): **UP — scrape
succeeded**, `GET early_rejection — HTTP 401`, `GET early_rejection — HTTP 400`
and `GET unmatched — HTTP 404`, next to the real staging traffic by route
pattern. The **Request coverage** panel describes the staging `backend`
container. As a Viewer, the dashboard offers no save, and the data source and
the Administration pages are not available.

Staging reuses the same provisioned dashboard. Deploys do not update it:
after a release that changes the dashboard or Prometheus configuration, run
`sudo mtogo-deploy.sh monitoring up` to install that release's files
(`monitoring status` names the release they came from). From #171 it shows
the data state, response rate, 5xx proportion and p95 panels described in
[local request monitoring](/MTGO/quality/local-request-monitoring/).
Deliberate failure tests stay on the local stack, never on staging.

From a release with #172, the bottom row shows the CPU (in cores), resident
and heap memory (bytes) and event-loop delay (seconds) of the staging
`backend` container's Node process. The CPU value is not the Droplet's
utilization: the host also runs the storefront, partner app, Redis and the
non-MTOGO containers, which no panel covers. Compare resident memory with the
backend's `docker stats` reading. They are close but not equal: one is the
process's resident set, the other the memory the container's cgroup is
charged for. The meaning and useful range of each
value are in
[local request monitoring](/MTGO/quality/local-request-monitoring/#http-serving-process-cpu-memory-and-event-loop-delay-172).
The process collectors add a few dozen bounded series to Prometheus.

From a release with #173, a row under the p95 charts shows open kitchen feeds
(partner app Server-Sent Events), their terminations by outcome and
interrupted requests. Feeds and interruptions never enter the ordinary counts,
rate or p95. Expect one active feed per signed-in kitchen screen. Feeds ended by a deploy
are not recorded: collection stops with the old process, and the restart
resets the counters. Meanings are in
[local request monitoring](/MTGO/quality/local-request-monitoring/#streams-and-interrupted-requests-173).
Leave the interruption demonstration (stopping the database) to the local
stack.

### 7. Memory readings after activation and during a deploy

Take the reading from step 1 again after activation. For the deploy reading,
run this in a second SSH session while a delivery (or
`sudo mtogo-deploy.sh deploy <current sha> --skip-migrations`) runs, and stop
it with Ctrl+C when the deploy finishes:

```bash
while sleep 5; do
  printf '%s available=%s MB\n' "$(date -u +%T)" "$(free -m | awk '/^Mem:/ {print $7}')"
  sudo docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep -E 'mtogo|prometheus|grafana'
done | tee ~/mtogo-deploy-memory.log
```

Record the lowest `available` value and the container readings next to it.
Compare them with the floor above.

## Operation

```bash
sudo mtogo-deploy.sh monitoring status   # source release and container health
sudo docker logs --since=10m mtogo-staging-monitoring-grafana-1
sudo docker logs --since=10m mtogo-staging-monitoring-prometheus-1
sudo mtogo-deploy.sh monitoring up       # restart after a problem; history survives
```

A backend restart or deploy resets the raw counts. Rolling five-minute values
need two scrapes after the restart, and the dashboard shows the gap. Stopping
Prometheus or Grafana never affects the application. A rollback of the
application to a release from before #194 detaches the backend from the scrape
network: the dashboard shows **DOWN** until a release with #194 runs again.

## Rollback

Each step is independent and leaves the application running. Do them in this
order to remove monitoring completely.

1. Stop Prometheus and Grafana. History and accounts stay for a later
   `monitoring up`.

   ```bash
   sudo mtogo-deploy.sh monitoring down
   ```

2. Remove the Grafana site block from Caddy and reload it. The DNS record can
   go too.

3. Disable the exporter: set `STAGING_METRICS_ENABLED=0` in
   `/srv/mtogo-staging/.env`. It applies at the next deploy. To apply it now,
   recreate the backend (the API restarts for about a minute):

   ```bash
   sudo mtogo-deploy.sh compose up -d --wait backend
   ```

4. Only to discard history and accounts too: remove the two volumes and the
   folder. The `mtogo-staging-metrics` network belongs to the application
   project; leave it.

   ```bash
   sudo docker volume rm mtogo-staging-monitoring_prometheus-data mtogo-staging-monitoring_grafana-data
   sudo rm -rf /srv/mtogo-monitoring
   ```

Check afterwards that the application is unaffected:
`sudo mtogo-deploy.sh status` shows every service healthy, and
`curl -I https://api.staging.example.org/health` returns 200.

## Troubleshooting

| Symptom                                    | Check/action                                                                                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown command: monitoring`              | The installed deploy script is older: deploys never replace it. Re-install it from the live release commit ([staging deployment, step 4](/MTGO/quality/staging-deployment/#4-scripts)); `sudo mtogo-deploy.sh help \| grep monitoring` then lists the commands. |
| `release ... has no staging monitoring`    | The live release predates #194. Wait for the deploy of a release that contains it.                                                                                                                                                                              |
| Target DOWN                                | `STAGING_METRICS_ENABLED=1`, then `monitoring up` again (it recreates the backend). Check backend logs for the constant metrics warning. Never publish 9464.                                                                                                    |
| Caddy returns 502 for Grafana              | `monitoring status`; the Caddy upstream must match `STAGING_BIND_ADDRESS:STAGING_GRAFANA_PORT`. With Caddy in a container, use the `docker0` gateway address.                                                                                                   |
| `viewer-add` fails                         | The login already exists, or `GRAFANA_ADMIN_PASSWORD` differs from the one Grafana stored on its first start.                                                                                                                                                   |
| Admin password from `.env` does not work   | Reset Grafana to a new value and put the same value in `.env`: `openssl rand -hex 24 \| tee /dev/tty \| sudo docker exec -i mtogo-staging-monitoring-grafana-1 grafana cli admin reset-admin-password --password-from-stdin`.                                   |
| "Too many login attempts"                  | Brute-force protection locked the login for a few minutes. Wait, then sign in with the right password.                                                                                                                                                          |
| Grafana pages hang or `/login` returns 500 | `docker stats`: Grafana near its cap with steady CPU means garbage-collection thrashing, not a crash. Raise the cap (above) and check `available` stays above the floor.                                                                                        |
| A container restarts with exit code 137    | It reached its memory cap. Record `docker stats`, then raise the cap only within the floor above, or roll back.                                                                                                                                                 |
| Dashboard or data source missing           | Check Grafana's logs for provisioning errors, then `monitoring up` again so all files come from one release.                                                                                                                                                    |

## Manual acceptance record

To be filled in by the repository admin. No secrets or passwords belong here.

| Reading or check                                             | Date and result                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `free -m` available before activation                        | 20 November 2026: 883 MB available of 1,963 MB; swap 194 of 2,047 MB. Immediately before `monitoring up`: 893 MB available; swap 195 MB                                                                                                                                                                                                                                                                                                  |
| `docker stats` before activation (MTOGO total)               | 20 November 2026: backend 260 MiB, storefront 124, partner 102, redis 8 (about 494 MiB)                                                                                                                                                                                                                                                                                                                                                  |
| `free -m` available after activation                         | 20 November 2026, right after `monitoring up`: 826 MB available (67 MB less); swap 207 MB                                                                                                                                                                                                                                                                                                                                                |
| `docker stats` prometheus / grafana after activation         | 20 November 2026: prometheus 49.9 MiB of 192 MiB (26%), grafana 187.5 MiB of 256 MiB (73%). MTOGO apps unchanged: backend 265, storefront 145, partner 102, redis 8 MiB                                                                                                                                                                                                                                                                  |
| Lowest `free -m` available during one deploy                 |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docker stats` at that moment                                |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Floor agreed with the team, and whether every reading met it |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Exporter, Prometheus and admin API unreachable (step 6)      |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Viewer sees real traffic and an early rejection (step 6)     | 20 November 2026, about 18:55, #171 dashboard: UP — traffic observed, real traffic by route pattern (for example `GET /store/collections` 200, `GET /store/orders` 401, 404s), 0.081 req/s, 5xx 0.0%, p95 96 ms from 24 observations. Checked signed in as the admin (the page offered **Make editable**), not as a Viewer, and before the step 6 `curl` commands, so the Viewer sign-in and the `early_rejection` series are still open |
| Rollback steps 1 and 3 rehearsed, application unaffected     |                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Activation on 20 November 2026 (release `e6736400`): the Droplet still ran
the deploy script from before #194, so `help` listed no `monitoring` command.
Re-installing it from the release commit fixed that. `monitoring up` then
recreated the backend with the exporter on, created both volumes, pulled the
pinned images and reported Prometheus and Grafana healthy. The Droplet also
runs non-MTOGO containers (a Java service, PostgreSQL, a static site,
Watchtower and Caddy, about 200 MiB together), so record whole-host
`available`, not only the MTOGO containers. Grafana started at 73% of its cap;
watch it in the deploy reading and after a few days of use.

About 15 minutes later Grafana reached 253.9 MiB of 256 MiB with 28% CPU; the
site no longer loaded and `/login` returned 500 after 45 to 92 seconds. Host
`available` was 618 MB, load average 2.16, so the host itself was not
exhausted. The cap was raised to 448 MB in Git. Until a release carries it,
raise it on the running container (`monitoring up` would restore the cap of
the release it copies):

```bash
sudo docker update --memory 448m --memory-swap 448m mtogo-staging-monitoring-grafana-1
```

The same check showed the **5xx proportion** chart with a 0–10000% axis while
every value was 0%: the ratio panel had no axis bounds. #172 fixes it to
0–100%. The **p95 by route pattern** chart showed some routes near 4 s and
one near 9 s between 18:50 and 18:55 while the overall p95 later fell to
96 ms; identify those routes before treating it as a regression.

## Verification in the repository

Agent verification on 20 November 2026: both Compose files and the dashboard
parse, and the docs build passed. Docker is not available in the development
container used, so `monitoring up` runs `docker compose config` and
`promtool check config` on the Droplet before starting anything. The deploy
script passes `shellcheck`. The application code is unchanged: the exporter
and its tests are those of #169 and #170.
