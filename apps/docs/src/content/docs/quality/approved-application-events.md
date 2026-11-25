---
title: Approved application events in Grafana
description: Existing backend, partner and storefront events collected by Alloy, rebuilt from the logging allowlist and searchable or live-tailed in Loki through the private Grafana, locally and as an opt-in on staging.
---

These are issues [#176](https://github.com/DannyShayH/MTGO/issues/176)
(backend) and [#177](https://github.com/DannyShayH/MTGO/issues/177) (partner
and storefront), slices 8 and 9 of
[#167](https://github.com/DannyShayH/MTGO/issues/167). Existing events of the
three apps from the [logging contract](/MTGO/quality/logging/) flow through
Alloy into Loki. You can search and live-tail them in the same private Grafana
as the [request metrics](/MTGO/quality/local-request-monitoring/). Winston, the
event vocabulary, what each app logs and how request IDs travel are unchanged.
Seven-day history and resume
([#178](https://github.com/DannyShayH/MTGO/issues/178)) are
[below](#history-import-resume-and-retention), and so are the
[health views](#pipeline-health-and-failures) of
[#179](https://github.com/DannyShayH/MTGO/issues/179).
Budgets are [#182](https://github.com/DannyShayH/MTGO/issues/182).

## The data boundary

Alloy, not the dashboard, decides what enters Loki. The module
`deploy/monitoring/alloy/approved-events.alloy` keeps a line only when all of
these hold:

- It is a JSON object of at most 4 KiB.
- Its `event`, `level` and `msg` are one of the combinations in
  `@dtc/logging` (for example `request.failed`, `error`, `Request failed`).
- `service` is `backend`, `partner` or `storefront`, **and it is the Compose
  service of the container that wrote the line**. This is meant to stop a
  partner container from putting a `backend` record into Loki, and the
  reverse. The fixture test is what proves it.
- `env` is `development`, `test`, `production` or `staging`, and `time` is a
  UTC ISO time with milliseconds.

Events are not tied to an app: `@dtc/logging` lets any app use any event, so
the pipeline accepts any recognized event from any of the three.

It then **rebuilds** the line from validated allowlisted fields. The original
line is never forwarded. Medusa's own `message` and `timestamp` are dropped, and
so are unknown fields, nested objects and error messages or stacks. An optional
field with an invalid value is left out, just as the record builder leaves it
out. `outcome` survives only on `refund.attempted`
and `category` only on `order.cancelled`. The menu timings survive
only on `menu.read.slow`. `err` is reduced to `{"type": ...}` on
`request.failed`. Valid JSON alone never qualifies a line.

Everything else is dropped from the Loki pipeline: Medusa and Next.js startup
and framework lines, Next.js server errors, raw errors with stacks, unknown
events, plain text and other services.
Those lines **stay in Docker's logs**
(`docker compose logs`, `mtogo-deploy.sh logs`). The viewer removes nothing
there.

| Stream labels (indexed)   | Searchable fields in the record (not labels)                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `service`, `env`, `level` | `event`, `request_id`, `route`, `method`, `status`, actor/Restaurant/Order IDs, … |

Loki stores the producer's own `time` as the entry time. The Loki
configuration turns off automatic `service_name` and level detection, so the
labels are exactly those three. `service` comes from the validated record and
always equals its container's Compose service.

Alloy reads only the `backend`, `partner` and `storefront` services of one
Compose project (`mtogo-monitoring-demo` locally, `mtogo-staging` on the
Droplet). The collector sets a temporary `source_service` label from the
container's Compose service. The pipeline compares it with the record and then
drops it. One-off `run` containers (migrations, seeds), the database, Redis,
Caddy, the staging `worker`, browser console output and other projects are
never read.

### What correlates, and what does not

Correlation is what the apps do themselves
([ADR-0019](/MTGO/architecture/decisions/0019-safe-application-logging-and-request-correlation/),
widened in [#247](https://github.com/DannyShayH/MTGO/issues/247)). The viewer
adds nothing to it.

| Journey                                                    | How to follow it                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Partner sign-in and other partner calls that forward an ID | By `request_id`: the partner's record and the backend's refusal or failure.                                                |
| Storefront page                                            | By `request_id`: the storefront's failed call or server error and the backend's record. Shared cached fetches carry no ID. |
| Partner sign-out                                           | Partner event only. Sign-out does not call the backend.                                                                    |
| One Order, from placement to handover or cancellation      | By `order_id`: `{service="backend"} \| json \| order_id="order_..."`. Milestones carry no `request_id`.                    |
| Work in jobs (recovery sweeps, refunds)                    | By `order_id` or `restaurant_id`; there is no request.                                                                     |

**If the staging `worker` profile is enabled**, jobs run in the `worker`
container, which Alloy does not read. Automatic cancellations
(`acceptance_timeout`, `unassigned_timeout`) and job failures then stay in
Docker's logs only. By default staging runs jobs in `backend`, which is read.

Not every request produces an event. A search that finds nothing under an ID
does not prove that a step did not happen. There is no tracing.

| Component | Pinned version | Listens on                                                      |
| --------- | -------------- | --------------------------------------------------------------- |
| Loki      | 3.7.10         | `loki:3100` on the internal `logs` network; no published port   |
| Alloy     | 1.22.0         | `alloy:12345` on the internal `logs` network; no published port |

Alloy reads the Docker socket. A read-only mount does **not** restrict which
Docker API calls a process can make: anyone who controls the Alloy container
controls Docker. This is acceptable for the disposable local demo. On staging
the repository admin accepts it by enabling the profile (below), or puts a
restricted socket proxy in front of it later.

## Local journey

Start from the [local request monitoring](/MTGO/quality/local-request-monitoring/#fresh-local-startup)
runbook. `docker compose up -d` in `deploy/monitoring` now also starts Loki and
Alloy. Grafana gets a second data source, **Application events**, and the
dashboard **MTOGO — approved application events**. To check the configuration
before starting:

```bash
cd deploy/monitoring
docker compose config --quiet
docker compose run --rm --no-deps loki -config.file=/etc/loki/config.yaml -verify-config
docker compose run --rm --no-deps --entrypoint /bin/alloy alloy fmt /etc/alloy/config.alloy > /dev/null
docker compose up -d
```

The demo also has the **partner** app (`127.0.0.1:8100`), built from the same
Dockerfile target as staging. It talks to the demo backend over the private
network. Build and start it after the backend is healthy:

```bash
docker compose -f compose.application.yaml build partner
docker compose -f compose.application.yaml up -d partner
curl --fail --retry 60 --retry-all-errors --retry-delay 2 -o /dev/null http://127.0.0.1:8100/sign-in
```

The storefront is **not** in the local demo. Its image inlines the publishable
key and backend URL at build time, and it prerenders from a running backend.
Storefront records are proven by the fixture test (below) with genuine
storefront production lines, and live on staging.

Log in as `local-viewer`. Open
`http://127.0.0.1:3000/d/mtogo-application-events?refresh=5s`. This is the
Viewer's live tail: the dashboard re-runs its query every 5 seconds (or pick
**5s** in the refresh picker). It is polling, not Loki's streaming tail.
Grafana's streaming **Live** mode is in Explore, which Viewers cannot open
here. Then:

1. **Backend event.** Run the existing demo read. It logs
   `monitoring.demo_read.succeeded`:

   ```bash
   docker compose -f compose.application.yaml exec backend npm exec --no -- medusa exec ./src/scripts/observe-local-request.js
   ```

   The record appears in this terminal, **not** in Grafana: `exec` output is
   not part of the container's Docker log, which is all Alloy reads (checked
   on 25 November 2026). The request it makes is counted on the request
   dashboard. Step 2 is the event check.

2. **Partner and backend under one request ID.** Open
   `http://127.0.0.1:8100/sign-in` and sign in with a made-up email and
   password. Within about 15 seconds the view shows the partner's
   `auth.sign_in.failed` and the backend's `access.denied`, both with status 401. Open the partner event's details and copy its `request_id`. Paste it
   into **Request ID starts with**: exactly those two events remain, one per
   application. The ID is the one the partner generated and forwarded.

3. **Filters.** Set **Application** to `partner` (or `backend`), **Severity**
   to `warn` and **Event starts with** to `auth.`. Each narrows the list.

The Medusa and Next.js startup lines (`Server is ready…`, `▲ Next.js …`,
`✓ Ready`) are in `docker compose -f compose.application.yaml logs backend partner`
but not in Grafana. The same holds for anything else that is not an approved
event.

Useful LogQL, for an administrator in Explore (including **Live**) or the API:

```text
{service=~".+"}                                             every approved event
{service="partner", level="warn"} | json | event="auth.sign_in.failed"
{service=~".+"} | json | request_id="<id>"                  one interaction, every app
{service="backend"} | json | order_id="<order id>"          one Order's milestones
```

### The boundary, as a Viewer

The dashboard's filters are not the boundary. A Viewer can send **any** LogQL
to the data source through Grafana's query API, not only the dashboard's own
queries. Prove that the raw lines are not in the dataset itself, with the
Viewer's own credentials. The password stays in `.env`:

```bash
node --env-file=.env --input-type=module <<'NODE'
const auth = `Basic ${Buffer.from(`local-viewer:${process.env.GRAFANA_VIEWER_PASSWORD}`).toString("base64")}`
for (const expr of ['{service=~".+"} |= "Server is ready"', '{service=~".+"} |= "Next.js"', '{service=~".+"} |~ "(?i)password|authorization|stack"', '{env=~".+"} |~ "(?i)postgres|redis|caddy"']) {
  const response = await fetch("http://127.0.0.1:3000/api/ds/query", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({ from: "now-24h", to: "now", queries: [{ refId: "A", datasource: { uid: "mtogo-loki" }, expr, queryType: "range", maxLines: 10 }] }),
  })
  const frames = (await response.json()).results?.A?.frames ?? []
  const lines = frames.reduce((sum, frame) => sum + (frame.data?.values?.[0]?.length ?? 0), 0)
  console.log(response.status, lines, "lines for", expr)
}
NODE
```

Every query returns HTTP 200 and **0 lines**. A 200 shows the Viewer really
queried Loki beyond the dashboard. The `docker compose logs` above still have
the startup lines.

## History: import, resume and retention

Three mechanisms are separate. None of them is a backup or an audit archive, and
delivery is best effort.

| Mechanism               | Bound                                       | What it decides                         |
| ----------------------- | ------------------------------------------- | --------------------------------------- |
| Docker's log rotation   | 5 files of 10 MB per container              | What Alloy can still read. Not time.    |
| Alloy's import window   | The record's own `time` within 168 hours    | What enters Loki.                       |
| Loki's retention (168h) | Queries: 168 hours. Files: later, see below | What a Viewer sees, and what is deleted |

**First startup.** Alloy reads everything Docker still has for the three
containers and imports the approved records of the last seven days. Records that
Docker rotated away, or that went with a removed container, are gone. Nothing
recovers them, and an empty period in Grafana does not prove that nothing
happened. Imported records are searchable at once: Loki also asks the part of its
storage that is not yet written to disk (`query_ingesters_within: 0s`).

**Resume.** Alloy saves each container's read position in the `alloy-data`
volume. A position belongs to the component's name
(`loki.source.docker.application`) and to the container's labels, which the
collector reduces to its ID and service. Docker's other labels, such as the
network address, can change on a restart and would lose the position. Recreating
Alloy or Loki keeps their volumes, so both continue where they were.

| What happens                                           | Expect                                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alloy or Loki recreated, volumes kept                  | History stays and reading resumes. Positions are whole seconds, so the last second is read again.                                                                                       |
| Application container replaced (a deploy)              | Earlier history stays in Loki. The new container is a new source. Lines Alloy had not read from the old one are lost.                                                                   |
| Application container stopped and started again        | A replay: Alloy forgets the position of a container that left the list, and reads its log from the start.                                                                               |
| Alloy away longer than Docker's rotation keeps         | A gap: the rotated lines are lost.                                                                                                                                                      |
| Alloy killed, or Loki away longer than Alloy's retries | A gap: positions advance when a line is read, not when Loki has it.                                                                                                                     |
| `alloy-data` removed, `loki-data` kept                 | A replay of what Docker still has. Loki merges identical records when it answers a query. It refuses those over an hour older than the newest record it holds in memory for the stream. |
| `loki-data` removed, `alloy-data` kept                 | History is gone and is **not** imported again. Remove both volumes to import what Docker still has.                                                                                     |

A replay is therefore usually invisible, but duplicates are possible. Never
count business events from Loki.

**Retention.** The Compactor runs every 10 minutes. It marks chunks whose newest
record is over seven days old, and deletes their files two hours later. A chunk
holds up to two hours of records in normal operation, but one first-import chunk
can hold several days and is kept until its newest record expires. So deletion is
asynchronous, and an imported record's file can stay for up to a week longer
than the record itself is shown. No query returns anything older than seven days,
whatever is still on disk (`max_query_lookback`). The Compactor's markers and
Loki's write-ahead log are in `loki-data`, so deletion continues after a
recreation.

Retention limits time, **not disk space**. There is no size quota: a burst of
events takes what it takes for seven days
([#182](https://github.com/DannyShayH/MTGO/issues/182)). Docker's rotation is a
separate limit on the source logs, and the raw lines there are never deleted by
Loki.

To see the saved position and retention at work:

```bash
docker compose exec alloy cat /var/lib/alloy/data/loki.source.docker.application/positions.yml
docker compose logs loki | grep -i retention
```

### History check

`deploy/monitoring/tests/log-history/` demonstrates the steps below on real,
disposable containers with the real collector, pipeline and Loki configuration.
It needs Docker and Node on the host and takes up to 30 minutes. It creates and
removes only the `mtogo-log-history-test` project.

```bash
cd deploy/monitoring
node tests/log-history/check.mjs
```

| Step               | Proves                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| First startup      | A record from inside the window is imported; Alloy's own counter shows that the one from outside was dropped.              |
| Position resume    | A recreated Alloy reads only the new lines, and the position is under ID and service.                                      |
| Loki recreation    | Earlier records are still there and new ones arrive.                                                                       |
| Replacement        | Earlier history stays. A container replaced while Alloy was away leaves the expected gap.                                  |
| Rotation           | All of 100 records arrive across several small (10 kB) rotations. Records rotated away while Alloy was away stay missing.  |
| Retention          | With the real 168 hours and a fast Compactor, an 8-day-old chunk is deleted, a 6-day-old one is kept, across a recreation. |
| Duplicates (shown) | How many records a query shows more than once. This is reported, never a failure.                                          |

The retention step changes four settings on the command line only: it accepts and
shows old records, and the Compactor runs every 10 seconds without the two-hour
delay. `src/observability/__tests__/log-history.unit.spec.ts` in the backend
checks the configuration that makes it work, in the normal unit suite.

## Pipeline health and failures

An empty event list does not say why it is empty. The dashboard **MTOGO —
approved application events** therefore shows the collection itself, above the
list. Prometheus scrapes Alloy and Loki every 15 seconds over the internal `logs`
network. It keeps seven metrics of the two, plus `up`: only what the panels show.
General process, host, container and database metrics stay out of scope.

| What you see                                                          | Meaning                                                                                                                                 | Do                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Collecting — lines read**, Loki **UP**, empty list                  | **No matching events** in the range, if the [past rule](#reading-a-past-range) below holds for all of it.                               | Widen the filters or the range.                                                                  |
| **No line read in 5 minutes — quiet, or containers not read**         | Undecided: the applications wrote nothing, or Alloy found or could read no container. Quiet is normal in the demo.                      | Make one request. If the state stays, check `MTOGO_LOG_PROJECT` and `docker compose logs alloy`. |
| **Collection DOWN — Alloy not reachable**                             | **Failed collection.** Nothing new arrives. Stored events are still searchable.                                                         | `docker compose ps alloy` and its logs. What Docker still has is read after the start.           |
| **Cannot list containers — Docker not reachable**                     | **Failed collection.** New containers are not found.                                                                                    | Check the socket mount and Docker.                                                               |
| **Retrying — delivery to Loki is failing or delayed**                 | Events are late, not lost yet.                                                                                                          | Check Loki's logs. It clears five minutes after the last retry.                                  |
| **DROPPING — Alloy gave up on entries in the last 5 minutes**         | **Failed collection**, unless a replay caused it (below). See the drops panel for how many and why.                                     | Fix Loki. Dropped entries are not sent again; the raw lines may still be in Docker's logs.       |
| **History DOWN — Loki not reachable**, and an error in the list       | **Unavailable history.** Nothing can be searched. Alloy retries, and drops after about 7 to 15 minutes: the drops panel keeps counting. | `docker compose ps loki` and its logs.                                                           |
| **Insufficient history — fewer than two scrapes**                     | Alloy just started, or just came back after five minutes or more.                                                                       | Wait half a minute.                                                                              |
| **Unknown** or **Unavailable** on every panel, or a data source error | Prometheus is down or new. The pipeline's state is unknown. The event list still works while Loki does.                                 | `docker compose ps prometheus`.                                                                  |

Only the most serious condition is shown, in this order: Alloy down, Loki down,
insufficient history, dropping, listing failure, retrying, quiet, collecting. A
drop, listing failure or retry stays visible for five minutes after it ended.

### Reading a past range

The state at the top is about now. A line above it states the correlation
limits, and the full explanation of an empty list is in the collapsed **How to
read an empty list** row at the bottom (#246). Times are in the viewer's
browser time zone, like the request dashboard. For an empty list from an
earlier range, read the three panels in the **Collection health over time**
row below the list, over the same range:

| Panel                                        | Must show, for the whole range                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Collection state — over time**             | **Collecting**. This is where a past listing failure, retry or drop is seen.                                      |
| **Collector and history up — over time**     | **UP**, without blanks. A blank is a period without at least 19 of the 20 scrapes of five minutes.                |
| **Drops, refusals, retries and read errors** | No drop and no read error. A read error is a line Alloy could not read from Docker. It does not change the state. |

Then no approved event matched. If any of it differs, the empty list proves
nothing about that period: its events may have arrived later, or never. **No line
read** stays undecided in the past too.

The panels cover the three applications together. For an empty list filtered to
**one** application, they are not enough: make one request that logs an event
there, or see that `docker compose logs alloy` names its container.

### Bounds and loss

The applications write to stdout, and Docker appends that to a local file
(`json-file`). No application has an address for Loki or Alloy, shares a network
with them or waits for them, so delivery is never part of handling a request. They do share
the host, which is why everything below is bounded.

| What                    | Bound                                                                                               | When it is reached                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Alloy's buffer (memory) | Alloy's default queue of 10 MiB, in batches of 256 KiB, and at most about as much taken for sending | Alloy stops reading. It never grows, and nothing is written to disk.        |
| Retries                 | 30 attempts per batch, 5-second timeouts, waits of at most 30 seconds: about 7 to 15 minutes        | The batch is dropped and counted (`ingester_error`, or `rate_limited`).     |
| Backlog                 | Docker's rotation: 5 files of 10 MB per container                                                   | The oldest unread lines rotate away. **This loss is not counted anywhere.** |
| Alloy's shutdown        | 15 seconds to send what is queued (`stop_grace_period` is 30, so Docker waits)                      | The rest is lost: its position was already saved. Not counted.              |
| Loki's intake           | 1 MB/s, bursts of 2 MB                                                                              | HTTP 429. Alloy retries, as above.                                          |
| One line                | 1 MiB                                                                                               | Alloy skips it and logs `line too big`. Normally **not counted**.           |

The queue's size and its 15 seconds are Alloy's defaults on purpose. Alloy 1.22
refuses to start with another `queue_config`, or with a write-ahead log, unless it
runs with `--stability.level=experimental`. The memory a full queue takes under
staging's 160 MB cap is not measured ([#183](https://github.com/DannyShayH/MTGO/issues/183)).

So in a Loki outage: shorter than about 7 minutes normally loses nothing. Longer,
Alloy gives up on one group of records at a time, the oldest first, and the rest
waits in the queue and in Docker's files. With few events, a long outage loses all
of them but those of about the last 15 minutes.

Delivery is **best effort**: neither lossless nor exactly once. Three
things make the numbers imprecise:

- **The state covers the three applications together.** One whose log cannot be
  read is hidden while another is read: Alloy has no counter for it, only its log.
- **Zero drops is not proof.** Rotated lines, a killed Alloy and a removed
  container are not counted. Counters are read every 15 seconds, so what happens
  just before Alloy stops can be missed.
- **A drop is not always a loss.** When Loki refuses part of a batch, Alloy counts
  the whole batch. A [replay](#history-import-resume-and-retention) makes Loki
  refuse records it already has. Then the drops panel shows **refused by Loki**
  with `too_far_behind` or `greater_than_max_sample_age` beside the drops.

Grafana, Prometheus, Loki and Alloy run on the same host as the applications. A
whole-host failure takes all of it, and nothing here sends an alert.

### Outage check

`deploy/monitoring/tests/log-outage/` exercises this on real, disposable
containers with the real collector, pipeline, Loki and Prometheus configuration.
Three stand-in applications answer HTTP and log genuine records through Docker's
`json-file` driver, as on staging. The check asks Prometheus the dashboard's own
state query. It needs Docker and Node on the host and takes up to an hour. It creates and removes
only the `mtogo-log-outage-test` project.

```bash
cd deploy/monitoring
node tests/log-outage/check.mjs
```

| Step                          | Proves                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collecting                    | Records of all three applications arrive. A quiet pipeline reads as quiet, not as failed.                                                                                                                                                                      |
| Loki stopped                  | The state says so, every request is answered within 2 seconds, and the records arrive afterwards. The retries stay visible.                                                                                                                                    |
| Alloy stopped                 | The state says so, the applications continue, and Alloy reads the missed lines when it returns.                                                                                                                                                                |
| Prometheus or Grafana stopped | Applications and collection continue.                                                                                                                                                                                                                          |
| Long Loki outage              | 120,000 lines meet a queue of about 60,000: Alloy stops reading, the applications continue, retries run out, the drop is shown, and the unread backlog arrives later. How many records are neither stored nor counted as dropped is reported, never a failure. |

### The real applications, by hand

In the [local journey](#local-journey), with the demo backend and partner
running. For the storefront, run `npm run storefront:dev` against the demo
backend, or use your usual local storefront. Then, one component at a time:

```bash
docker compose stop loki        # then alloy, then prometheus, then grafana
curl --silent --output /dev/null --write-out '%{http_code} %{time_total}\n' http://127.0.0.1:9000/health
curl --silent --output /dev/null --write-out '%{http_code} %{time_total}\n' http://127.0.0.1:8100/sign-in
curl --silent --output /dev/null --write-out '%{http_code} %{time_total}\n' --location http://127.0.0.1:8000/
docker compose start loki
```

Each application answers as before, and the dashboard names the stopped component
(except Grafana itself). Do this only locally, never on staging. Record the status
and time of each here; the stand-ins of the outage check do not replace it.

| Stopped    | Backend   | Partner    | Storefront |
| ---------- | --------- | ---------- | ---------- |
| Loki       | 200, 4 ms | 200, 24 ms | Not run    |
| Alloy      | 200, 4 ms | 200, 17 ms | Not run    |
| Prometheus | 200, 4 ms | 200, 15 ms | Not run    |
| Grafana    | 200, 3 ms | 200, 15 ms | Not run    |

Run on 25 November 2026 on the local demo (backend `/health`, partner
`/sign-in`), 40 seconds after each stop. Prometheus reported
`up{job="mtogo-loki"}` and `up{job="mtogo-alloy"}` as 0 while each was
stopped. All components were then started again; both applications still
answered 200. The storefront is not in the local demo.

## Fixture test of the pipeline

`deploy/monitoring/tests/log-pipeline/` runs the **real** module in the pinned Alloy
against the pinned Loki and inspects what Loki stores, not what Alloy
extracted. Each case in `cases.json` names its `source` container. The check
writes one file per container (`backend.log`, `partner.log`, `storefront.log`),
and `fixture.alloy` labels each one as the collector labels that container.

The kept cases are producer lines: the backend's from `createLogRecord` through
Medusa's production logger, and the partner's and storefront's from
`createApplicationLogger` with `NODE_ENV=production`. That is Winston JSON with
sorted keys, as `next start` prints it. One backend record shares the partner
sign-in's request ID. The other cases are synthetic negatives: extra and nested
fields, Medusa `message` text, invalid IDs, error details, misplaced event
fields, out-of-range timings, Medusa and Next.js startup and error lines,
unknown events, wrong level, message or environment, a record over seven days
old (and one just under, which is kept), a record naming another
app than its container, an unknown service, plain text, arrays and oversized
lines. Every dropped value carries a `SECRET-MARKER`.

```bash
cd deploy/monitoring
docker compose -f tests/log-pipeline/compose.yaml up --abort-on-container-exit --exit-code-from check
docker compose -f tests/log-pipeline/compose.yaml down --volumes
```

It passes when the stored lines equal the expected reconstructions exactly,
every stream has only the three labels, each record's `service` equals its
stream's label, all three apps have records, no stored line contains `SECRET`,
the entry time is the record's own `time`, a `| json | request_id=` query
finds one backend record, and a query for the sign-in ID finds the partner and
the backend record. It needs no application, no Docker socket and no published
port.

`src/observability/__tests__/approved-log-events.unit.spec.ts` in the backend
runs in the normal unit suite. It fails when the recognized combinations drift
from `@dtc/logging`'s vocabulary, or when an expected stored record is not the
record builder's own reconstruction. It also fails when a service is accepted
from another container or the collector reads other services. It checks the
label set and the pinned images too.

## Staging (opt-in)

Loki and Alloy are in `deploy/monitoring/compose.staging.yaml` under the
Compose profile `logs`. They start only when `/srv/mtogo-staging/.env` has
`STAGING_LOGS_ENABLED=1`. Without it, `monitoring up` starts only
[Prometheus, Grafana and Node Exporter](/MTGO/quality/staging-request-monitoring/),
and the two log pipeline targets are DOWN.

| Container | Hard cap | Go memory limit | Persistent state                     |
| --------- | -------- | --------------- | ------------------------------------ |
| loki      | 256 MB   | 200 MiB         | `loki-data`: chunks, retention state |
| alloy     | 160 MB   | 120 MiB         | `alloy-data`: read positions         |

The caps add at most 416 MB to the 688 MB of Prometheus, Grafana and Node
Exporter. The idle reading on 20 November 2026, before monitoring, had 883 MB available. Whether
the whole stack fits is not yet measured. That is
[#183](https://github.com/DannyShayH/MTGO/issues/183). Use the same 200 MB
`available` floor and readings as
[staging request monitoring](/MTGO/quality/staging-request-monitoring/#memory-budget).
If they fail, switch logs off again. Seven-day retention is a time policy, not
a disk quota ([history](#history-import-resume-and-retention)).

Activation, by the repository admin on the Droplet, after this change is live:

1. Re-install `mtogo-deploy.sh` from the live commit
   ([staging deployment, step 4](/MTGO/quality/staging-deployment/#4-scripts)).
   `monitoring up` and `down` now know the `logs` profile.
2. Take a memory reading (`free -m`, `docker stats --no-stream`).
3. Add `STAGING_LOGS_ENABLED=1` to `/srv/mtogo-staging/.env`
   (`STAGING_METRICS_ENABLED=1` stays).
4. Run `sudo mtogo-deploy.sh monitoring update`. It copies the new
   `deploy/monitoring/` from the live release and validates it, including the
   Loki configuration. Then it recreates the stack with Loki and Alloy. (Plain
   `monitoring up` keeps the installed files, see
   [releases and rollback](/MTGO/quality/staging-request-monitoring/#releases-and-rollback).)
5. Open Grafana's **MTOGO — approved application events** as a Viewer. Trigger
   `curl -s -o /dev/null -w '%{http_code}\n' https://<api host>/partner/me -H 'x-request-id: staging-176'`
   and search `staging-176`. For the partner and the storefront, see
   [staging journey](#staging-journey-for-the-partner-and-storefront).
6. Take memory readings again after activation and during one deploy.

Switch off: set `STAGING_LOGS_ENABLED=0`, then run
`sudo mtogo-deploy.sh monitoring down` and `sudo mtogo-deploy.sh monitoring up`.
The `loki-data` and `alloy-data` volumes stay. Remove them with
`sudo docker volume rm mtogo-staging-monitoring_loki-data mtogo-staging-monitoring_alloy-data`
only to discard log history.

With #177 live, Alloy also reads the staging `partner` and `storefront`
containers. No setting changes, and the `worker` is still not read. Alloy now
follows three containers instead of one, so include it in the memory readings
of step 6. Its cap is unchanged.

With #179 live, `monitoring update` also makes Prometheus scrape Alloy and Loki. No
setting changes. When `STAGING_LOGS_ENABLED` is not `1`, the two targets, the state
and Loki are DOWN and the counters Unavailable, as expected. Include Prometheus in the memory
readings of step 6; the added series are few. To check it, read only: the
dashboard shows Loki **UP** within a minute, the request of step 5 appears, and the
state is **Collecting** (or **No line read**) after at most about six minutes. Until
then it can be **Retrying**, because Alloy may start before Loki is ready, or
**DROPPING** after a replay. Stop no component on staging to provoke a state.

With #178 live, the first `monitoring update` changes how positions are stored.
Alloy therefore reads each container's retained log **once more**: a replay, as
in the table above. Expect rejected-entry warnings from Alloy for a moment.
Nothing has to be removed.

### Staging journey for the partner and storefront

Use synthetic input only, and send no deliberate failures or load to staging.

1. **Partner and backend.** Open the staging partner sign-in page and sign in
   with a made-up email and password. As a Viewer, find `auth.sign_in.failed`
   (`partner`) and copy its `request_id`. Search that ID: the backend's
   `access.denied` for `/auth/restaurant_staff/emailpass` is listed beside it.
2. **Storefront.** Storefront events appear only when a backend call from the
   storefront server fails (`upstream.request.failed`), or when its exporter
   cannot start (`monitoring.exporter.unavailable`). Do not provoke them on
   staging. Set **Application** to `storefront` and read what already happened
   in the time range. An empty list with a healthy data source means none
   happened. The fixture test is the proof of the storefront path.
3. Run the [Viewer boundary queries](#the-boundary-as-a-viewer) through the
   tunnel with a staging Viewer account.

## Troubleshooting

| Symptom                                                                    | Check/action                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alloy restarts again and again, `requires stability.level flag` in its log | `alloy/config.alloy` has a `queue_config` or `wal` block. Remove it ([bounds](#bounds-and-loss)).                                                                                               |
| The collection panels show a failure                                       | See [pipeline health](#pipeline-health-and-failures): each state has its meaning and its check.                                                                                                 |
| Collection panels are Unknown or Unavailable                               | Prometheus has no `mtogo-alloy` or `mtogo-loki` target: it still runs an older configuration. Recreate it (`docker compose up -d --force-recreate prometheus`, on staging `monitoring update`). |
| Dashboard says the data source failed                                      | Loki is not running or not on the `logs` network (on staging: `STAGING_LOGS_ENABLED` is not `1`). `docker compose ps loki` and its logs.                                                        |
| No events, Loki healthy                                                    | No approved event in the time range. Produce one (above). Check Alloy found the container: `docker compose logs alloy` names the target. The project name must match `MTOGO_LOG_PROJECT`.       |
| An event is in Docker logs but not in Grafana                              | It is not recognized: an unknown event, wrong level/message pair, another service or non-production JSON. Development output (CLI format) is not JSON and never qualifies.                      |
| Partner or storefront events never appear                                  | `docker compose logs alloy` must name the container. Its Compose service must be exactly `partner` or `storefront`, and the record's `service` must match it.                                   |
| A field is missing from a stored event                                     | Its value failed the allowlist check and was left out. Compare with `packages/logging/src/record.cjs`.                                                                                          |
| Events appear twice after recreation                                       | A replay: see [resume](#history-import-resume-and-retention). Delivery is best effort, not exactly once.                                                                                        |
| Alloy warns `entry too far behind`                                         | A replay after a lost or changed position, or records that arrived over an hour late. Replayed records are normally stored already; late ones are lost.                                         |
| History is missing after `loki-data` was lost                              | Alloy's positions are past it. Stop the stack, remove `alloy-data` too and start again: what Docker still has within seven days is imported.                                                    |
| Disk use does not fall after seven days                                    | Deletion follows the newest record in a chunk, then the 10-minute run and the two-hour delay. Check `docker compose logs loki` for Compactor errors.                                            |
| Unit test fails after a new event                                          | Add its `event\|level\|msg` combination to the `recognized` expression in `approved-events.alloy` and re-run the fixture test.                                                                  |
| Permission denied on the Docker socket                                     | Compose runs Alloy as root (`user: "0"`) to read the socket. Check the socket path is `/var/run/docker.sock` on the host.                                                                       |

## Verification record

Agent verification for #179 on 25 November 2026:

| Boundary                          | Result                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit specs                | Passed: the bounds, no setting that Alloy's default stability level refuses, applications without a path to the pipeline in both Compose files, the scrape allowlist equal to what the panels use, every query verbatim in the promtool file, and words for every state, the same now and over time.                      |
| Pinned source                     | Read at the same tags: Alloy's queue, its stability check, retries, backoff, drop reasons and counters, the Docker reader, discovery failure counter, and Loki's refusal reasons. These are the claims in the tables above. The first reading missed the stability check; review found that Alloy would not have started. |
| Outage check                      | Its stand-in application was run alone and prints genuine records, and its shared helpers and state lookup were run without containers. `check.mjs` itself was only syntax-checked.                                                                                                                                       |
| promtool, Alloy, Loki, containers | **Not run**: no Docker engine in the devcontainer, and running the downloaded official binaries was declined by the sandbox. The eighteen promtool cases have expected values worked out by hand, and no tool has validated the Alloy, Prometheus or Compose syntax.                                                      |

Manual acceptance for #179:

- `promtool check config` and `promtool test rules` pass ([commands](/MTGO/quality/local-request-monitoring/#fresh-local-startup)).
- `node tests/log-outage/check.mjs` prints fourteen `ok` lines and exits 0.
- As a local Viewer: the dashboard shows **Collecting** and Loki **UP**. The panels fit at narrow and wide widths.
- Filter to an event that did not happen: an empty list with **Collecting**. Stop Alloy: **Collection DOWN**. Stop Loki: **History DOWN** and an error in the list. Stop Prometheus: the panels show no state, and the list still works.
- [The real applications](#the-real-applications-by-hand) answer with each component stopped.
- `docker compose logs alloy` has no `stability.level` error, and Alloy stays up.
- After a minute without Alloy, **Collection state — over time** and **Collector and history up — over time** show it, also when the range is in the past.
- Alloy and Loki have no host ports, and the Viewer boundary queries still return 0 lines.

Agent verification for #178 on 25 November 2026:

| Boundary                     | Result                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit specs           | Passed: the seven-day window, retention state, container identity, volumes in both stacks and rotation; both sides of the import window.                                                                                          |
| Pinned binaries, static only | The official Loki 3.7.10 and Alloy 1.22.0 binaries (published checksums matched) accepted the configurations: `loki -verify-config`, also with the retention step's four settings, and `alloy validate`.                          |
| Pinned source                | Read at the same tags: positions keyed on the whole label set, removal on container stop, whole-chunk expiry, hourly query splits, the one-hour ordering window and duplicate handling. These are the claims in the tables above. |
| Running Loki and Alloy       | **Not run**: no Docker engine in the devcontainer, and running the binaries as servers was not permitted. The history check (never executed yet), the fixture test and the Viewer's view are the developer's run.                 |

Manual acceptance for #178:

- `node tests/log-history/check.mjs` prints eight `ok` lines and exits 0. Record its duplicate count here.
- The fixture test passes, with the two records at the seven-day boundary.
- As a local Viewer: note an event's `request_id`, run `docker compose up -d --force-recreate loki alloy`, and find it again. Run the demo read: the new event appears too.
- `docker inspect` of the demo backend shows `max-size` 10m and `max-file` 5.

Agent verification for #247 on 25 November 2026: the pipeline recognizes the
eight milestones and the `category` field. The unit spec passes, and a throwaway
simulation of the module's expressions **and rebuild template** reproduced the
stored line of all 45 fixtures. It is not Alloy; re-run the
[fixture test](#fixture-test-of-the-pipeline). Both Next.js apps were built and
run in production mode against a stub backend: one `request.failed` per failed
request, and the same ID in the storefront's record and the backend call.

Agent verification on 25 November 2026, on the uncommitted #177 working tree:

| Boundary                         | Result                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit spec                | Passed: three services, each accepted only from its own container; the collector reads exactly those three; every kept fixture, partner and storefront included, equals the builder's reconstruction.                                  |
| Producer lines                   | Partner and storefront inputs were generated with `createApplicationLogger` and `NODE_ENV=production`; the correlated backend record with Medusa's production logger format.                                                           |
| Fixture writer                   | `check.cjs write` produced one file per container (26 backend, 6 partner, 5 storefront lines).                                                                                                                                         |
| Pipeline expressions             | A throwaway simulation using the module's own expressions, with the container identity check, reproduced all 37 expected keep/drop outcomes. This is not Alloy.                                                                        |
| Loki/Alloy containers, Viewer UI | **Not run**: the devcontainer has no Docker engine. The fixture test, the local partner journey, the Viewer boundary queries and the staging journey are the developer's run. The `stage.match` identity check is unproven until then. |

Earlier, for #176:

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
- With `?refresh=5s`, a failed local partner sign-in appears as `auth.sign_in.failed` (`partner`) and `access.denied` (`backend`). Searching the partner's `request_id` lists exactly those two.
- **Application**, **Severity** and **Event starts with** each narrow the list.
- The Viewer boundary queries return HTTP 200 and 0 lines, while `docker compose logs partner` still has the Next.js startup lines.
- `{service=~".+"} |= "Server is ready"` returns nothing in Loki, while Docker logs still have the line.
- Streams carry only `service`, `env` and `level`.
- Loki and Alloy have no host ports. Stopping either leaves the API working.
