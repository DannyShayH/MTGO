---
title: Approved backend events in Grafana
description: Existing backend application events collected by Alloy, rebuilt from the logging allowlist and searchable in Loki through the private Grafana, locally and as an opt-in on staging.
---

This is issue [#176](https://github.com/DannyShayH/MTGO/issues/176), slice 8 of
[#167](https://github.com/DannyShayH/MTGO/issues/167). Existing backend events
from the [logging contract](/MTGO/quality/logging/) flow through Alloy into
Loki, and you can search them in the same private Grafana as the
[request metrics](/MTGO/quality/local-request-monitoring/). Winston, the event
vocabulary and what the backend logs are unchanged. The storefront and partner
app follow in [#177](https://github.com/DannyShayH/MTGO/issues/177).
Retention and resume are [#178](https://github.com/DannyShayH/MTGO/issues/178).
Pipeline failure views are [#179](https://github.com/DannyShayH/MTGO/issues/179).
Budgets are [#182](https://github.com/DannyShayH/MTGO/issues/182).

## The data boundary

Alloy, not the dashboard, decides what enters Loki. The module
`deploy/monitoring/alloy/approved-events.alloy` keeps a line only when all of
these hold:

- It is a JSON object of at most 4 KiB.
- Its `event`, `level` and `msg` are one of the combinations in
  `@dtc/logging` (for example `request.failed`, `error`, `Request failed`).
- `service` is `backend`, `env` is `development`, `test`, `production` or
  `staging`, and `time` is a UTC ISO time with milliseconds.

It then **rebuilds** the line from validated allowlisted fields. The original
line is never forwarded. Medusa's own `message` and `timestamp` are dropped, and
so are unknown fields, nested objects and error messages or stacks. An optional
field with an invalid value is left out, just as the record builder leaves it
out. `outcome` survives only on `refund.attempted`. The menu timings survive
only on `menu.read.slow`. `err` is reduced to `{"type": ...}` on
`request.failed`. Valid JSON alone never qualifies a line.

Everything else is dropped from the Loki pipeline: Medusa startup and framework
lines, raw errors with stacks, unknown events, plain text and other services.
Those lines **stay in Docker's logs**
(`docker compose logs`, `mtogo-deploy.sh logs`). The viewer removes nothing
there.

| Stream labels (indexed)   | Searchable fields in the record (not labels)                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `service`, `env`, `level` | `event`, `request_id`, `route`, `method`, `status`, actor/Restaurant/Order IDs, … |

Loki stores the producer's own `time` as the entry time. The Loki
configuration turns off automatic `service_name` and level detection, so the
labels are exactly those three.

Alloy reads only one container: the `backend` service of one Compose project
(`mtogo-monitoring-demo` locally, `mtogo-staging` on the Droplet). One-off
`run` containers (migrations, seeds), the database, Redis, Caddy and other
projects are never read.

| Component | Pinned version | Listens on                                                        |
| --------- | -------------- | ----------------------------------------------------------------- |
| Loki      | 3.7.10         | `loki:3100` on the internal `logs` network; no published port     |
| Alloy     | 1.22.0         | Its UI on `127.0.0.1:12345` inside its container; no network port |

Alloy reads the Docker socket. A read-only mount does **not** restrict which
Docker API calls a process can make: anyone who controls the Alloy container
controls Docker. This is acceptable for the disposable local demo. On staging
the repository admin accepts it by enabling the profile (below), or puts a
restricted socket proxy in front of it later.

## Local journey

Start from the [local request monitoring](/MTGO/quality/local-request-monitoring/#fresh-local-startup)
runbook. `docker compose up -d` in `deploy/monitoring` now also starts Loki and
Alloy. Grafana gets a second data source, **Application events**, and the
dashboard **MTOGO — approved backend events**. To check the configuration
before starting:

```bash
cd deploy/monitoring
docker compose config --quiet
docker compose run --rm --no-deps loki -config.file=/etc/loki/config.yaml -verify-config
docker compose run --rm --no-deps --entrypoint /bin/alloy alloy fmt /etc/alloy/config.alloy > /dev/null
docker compose up -d
```

Produce a genuine backend event with the existing demo read. It logs
`monitoring.demo_read.succeeded`. Then trigger an `access.denied` event with a
known request ID:

```bash
docker compose -f compose.application.yaml exec backend npm exec --no -- medusa exec ./src/scripts/observe-local-request.js
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9000/partner/me -H 'x-request-id: demo-176'
```

Log in as `local-viewer` and open
`http://127.0.0.1:3000/d/mtogo-backend-events`. Within about 15 seconds you see
both events. Type `demo-176` into **Request ID starts with** to find the 401.
The Medusa startup lines (`Server is ready…`) are in
`docker compose -f compose.application.yaml logs backend` but not in Grafana.
The same holds for anything else that is not an approved event.

Useful LogQL, for an administrator in Explore or the API:

```text
{service="backend"}                                         every approved event
{service="backend", level="warn"} | json | event="access.denied"
{service="backend"} | json | request_id="demo-176"          one interaction
```

To prove the boundary with the dataset itself, not just the dashboard, run as
an administrator: `{service=~".+"} |= "Server is ready"` returns nothing.

## Fixture test of the pipeline

`deploy/monitoring/tests/log-pipeline/` runs the **real** module in the pinned Alloy
against the pinned Loki and inspects what Loki stores, not what Alloy
extracted. The kept cases in `cases.json` were produced by
`createLogRecord` and Medusa's production logger. The other cases are synthetic
negatives: extra and nested fields, Medusa `message` text, invalid IDs, error
details, misplaced event fields, out-of-range timings, startup and stack lines,
unknown events, wrong level, message, service or environment, plain text,
arrays and oversized lines. Every dropped value carries a `SECRET-MARKER`.

```bash
cd deploy/monitoring
docker compose -f tests/log-pipeline/compose.yaml up --abort-on-container-exit --exit-code-from check
docker compose -f tests/log-pipeline/compose.yaml down --volumes
```

It passes when the stored lines equal the expected reconstructions exactly,
every stream has only the three labels, no stored line contains `SECRET`, the
entry time is the record's own `time`, and a `| json | request_id=` query
finds one record. It needs no application, no Docker socket and no published
port.

`src/observability/__tests__/approved-log-events.unit.spec.ts` in the backend
runs in the normal unit suite. It fails when the recognized combinations drift
from `@dtc/logging`'s vocabulary, or when an expected stored record is not the
record builder's own reconstruction. It also checks the label set and the
pinned images.

## Staging (opt-in)

Loki and Alloy are in `deploy/monitoring/compose.staging.yaml` under the
Compose profile `logs`. They start only when `/srv/mtogo-staging/.env` has
`STAGING_LOGS_ENABLED=1`. Without it, `monitoring up` behaves exactly as for
[#194](/MTGO/quality/staging-request-monitoring/).

| Container | Hard cap | Go memory limit | Persistent state                    |
| --------- | -------- | --------------- | ----------------------------------- |
| loki      | 256 MB   | 200 MiB         | Volume `loki-data`: 7-day policy    |
| alloy     | 160 MB   | 120 MiB         | Volume `alloy-data`: read positions |

The caps add at most 416 MB to the 640 MB of Prometheus and Grafana. The idle
reading on 20 November 2026, before monitoring, had 883 MB available. Whether
the whole stack fits is not yet measured. That is
[#183](https://github.com/DannyShayH/MTGO/issues/183). Use the same 200 MB
`available` floor and readings as
[staging request monitoring](/MTGO/quality/staging-request-monitoring/#memory-budget).
If they fail, switch logs off again. Seven-day retention is a time policy, not
a disk quota.

Activation, by the repository admin on the Droplet, after this change is live:

1. Re-install `mtogo-deploy.sh` from the live commit
   ([staging deployment, step 4](/MTGO/quality/staging-deployment/#4-scripts)).
   `monitoring up` and `down` now know the `logs` profile.
2. Take a memory reading (`free -m`, `docker stats --no-stream`).
3. Add `STAGING_LOGS_ENABLED=1` to `/srv/mtogo-staging/.env`
   (`STAGING_METRICS_ENABLED=1` stays).
4. Run `sudo mtogo-deploy.sh monitoring up`. It copies the new
   `deploy/monitoring/` from the live release and validates the Loki
   configuration. Then it recreates the stack with Loki and Alloy.
5. Open Grafana's **MTOGO — approved backend events** as a Viewer. Trigger
   `curl -s -o /dev/null -w '%{http_code}\n' https://<api host>/partner/me -H 'x-request-id: staging-176'`
   and search `staging-176`.
6. Take memory readings again after activation and during one deploy.

Switch off: set `STAGING_LOGS_ENABLED=0`, then run
`sudo mtogo-deploy.sh monitoring down` and `sudo mtogo-deploy.sh monitoring up`.
The `loki-data` and `alloy-data` volumes stay. Remove them with
`sudo docker volume rm mtogo-staging-monitoring_loki-data mtogo-staging-monitoring_alloy-data`
only to discard log history.

## Troubleshooting

| Symptom                                       | Check/action                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard says the data source failed         | Loki is not running or not on the `logs` network (on staging: `STAGING_LOGS_ENABLED` is not `1`). `docker compose ps loki` and its logs.                                                  |
| No events, Loki healthy                       | No approved event in the time range. Produce one (above). Check Alloy found the container: `docker compose logs alloy` names the target. The project name must match `MTOGO_LOG_PROJECT`. |
| An event is in Docker logs but not in Grafana | It is not recognized: an unknown event, wrong level/message pair, another service or non-production JSON. Development output (CLI format) is not JSON and never qualifies.                |
| A field is missing from a stored event        | Its value failed the allowlist check and was left out. Compare with `packages/logging/src/index.cjs`.                                                                                     |
| Events appear twice after recreation          | Alloy resumes from saved positions in `alloy-data`; after losing that volume it reads the container's log again. Delivery is best effort, not exactly once.                               |
| Unit test fails after a new event             | Add its `event\|level\|msg` combination to the `recognized` expression in `approved-events.alloy` and re-run the fixture test.                                                            |
| Permission denied on the Docker socket        | Compose runs Alloy as root (`user: "0"`) to read the socket. Check the socket path is `/var/run/docker.sock` on the host.                                                                 |

## Verification record

Agent verification on 25 November 2026, on the uncommitted #176 working tree:

| Boundary                         | Result                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit spec                | Passed: vocabulary ↔ pipeline, label set, pinned images, every kept fixture equals the builder's reconstruction, no stored secret marker.                       |
| `@dtc/logging` tests             | Passed, including the new `logEvents` export.                                                                                                                   |
| Producer lines                   | The kept fixture inputs were generated with Medusa's production logger and `createLogRecord`.                                                                   |
| Pipeline expressions             | A throwaway simulation using the module's own regular expressions reproduced all 25 expected outcomes. This is not Alloy and does not replace the fixture test. |
| Loki/Alloy containers, Viewer UI | **Not run**: the devcontainer had no Docker engine and could not run the pinned binaries. The fixture test and the local journey above are the developer's run. |

Manual acceptance checklist for the developer:

- The fixture test passes.
- A Viewer sees `monitoring.demo_read.succeeded` and the `demo-176` `access.denied`, but no startup lines.
- `{service=~".+"} |= "Server is ready"` returns nothing in Loki, while Docker logs still have the line.
- Streams carry only `service`, `env` and `level`.
- Loki and Alloy have no host ports. Stopping either leaves the API working.
