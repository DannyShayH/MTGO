// Log pipeline failures on real, disposable containers (#179): Loki, Alloy,
// Prometheus and Grafana are stopped one at a time while three stand-in
// applications keep answering, and the dashboard's own state query must name
// each pipeline failure. Needs Docker and Node, and takes up to an hour, most of
// it waiting for retries to run out. From deploy/monitoring:
//   node tests/log-outage/check.mjs
// It creates and removes only the mtogo-log-outage-test project.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import {
  createProject,
  report,
  sumCounter,
  waitFor,
} from "../disposable-project.mjs"

const SERVICES = ["backend", "partner", "storefront"]
const ALLOY = "http://alloy:12345"
const LOKI = "http://loki:3100"
const PROMETHEUS = "http://prometheus:9090"
const GRAFANA = "http://grafana:3000"
/** A request is slow when it takes this long: no wait for the pipeline. */
const SLOW_MS = 2000
/**
 * Alloy's queue holds about 60,000 of these records (10 MiB of 175 bytes), and
 * Docker's rotation keeps at least 140,000 (40 MB of 275 bytes).
 */
const BURST = 120_000

const dashboard = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../grafana/dashboards/application-events.json",
    ),
    "utf8",
  ),
)
const panel = dashboard.panels.find(({ title }) =>
  title.startsWith("Collection state"),
)
const STATE_QUERY = panel.targets[0].expr
/** The number the dashboard shows with these words. */
function findState(words) {
  const [{ options }] = panel.fieldConfig.defaults.mappings
  const found = Object.keys(options).find((value) =>
    options[value].text.startsWith(words),
  )
  assert.ok(found, `no state is shown as ${words}`)
  return Number(found)
}

const { compose, start, removeProject } = createProject(
  join(import.meta.dirname, "compose.yaml"),
)
const stop = (service) => compose(["stop", service])

/** Runs fetches one after another inside the private networks; 0 is no answer. */
function requestAll(urls) {
  const script = `(async () => {
    const results = []
    for (const url of JSON.parse(process.argv[1])) {
      const from = Date.now()
      const { status, body } = await fetch(url, { signal: AbortSignal.timeout(60000) })
        .then(async (response) => ({ status: response.status, body: await response.text() }))
        .catch((error) => ({ status: 0, body: String(error) }))
      results.push({ status, body, ms: Date.now() - from })
    }
    console.log(JSON.stringify(results))
  })()`
  const args = ["exec", "-T", "query", "node", "-e", script]
  return JSON.parse(compose([...args, JSON.stringify(urls)]))
}

function request(url) {
  const [{ status, body }] = requestAll([url])
  assert.equal(status, 200, body)
  return body
}

/** The dashboard's collection state, as Prometheus evaluates it now. */
function readState() {
  const params = new URLSearchParams({ query: STATE_QUERY })
  const { data } = JSON.parse(request(`${PROMETHEUS}/api/v1/query?${params}`))
  assert.equal(data.result.length, 1, "the state query returns one value")
  return Number(data.result[0].value[1])
}
const waitForState = (words, minutes) => {
  const state = findState(words)
  return waitFor(`the state ${words}`, () => readState() === state, minutes)
}

/** The sum of a counter's series in Alloy. */
const readCounter = (name) => sumCounter(request(`${ALLOY}/metrics`), name)
const countRetries = () => readCounter("loki_write_batch_retries_total")

/** Whether Loki returns a record with this request ID. */
function isStored(requestId) {
  const now = Date.now()
  const params = new URLSearchParams({
    query: `{service=~".+"} | json | request_id="${requestId}"`,
    start: `${now - 2 * 3_600_000}000000`,
    end: `${now + 60_000}000000`,
  })
  const body = request(`${LOKI}/loki/api/v1/query_range?${params}`)
  return JSON.parse(body).data.result.length > 0
}
const waitForRecord = (requestId, minutes) =>
  waitFor(`${requestId} in Loki`, () => isStored(requestId), minutes)

/** How many records of the burst Loki returns. */
function countStoredBurst() {
  const query =
    'sum(count_over_time({service="backend"} | json | request_id=~"burst-.+" [2h]))'
  const params = new URLSearchParams({ query })
  const body = request(`${LOKI}/loki/api/v1/query?${params}`)
  return Number(JSON.parse(body).data.result[0].value[1])
}

/** Requests to every application; each logs a record. */
function sendRequests(name) {
  const urls = SERVICES.flatMap((service) =>
    Array.from(
      { length: 20 },
      (_, i) => `http://${service}:3000/?id=${name}-${service}-${i}`,
    ),
  )
  return requestAll(urls)
}

/** Every request was answered at once; returns the slowest one's time. */
function assertAnswered(results) {
  for (const { status, body } of results) assert.equal(status, 200, body)
  const slowest = Math.max(...results.map(({ ms }) => ms))
  assert.ok(slowest < SLOW_MS, `a request took ${slowest} ms`)
  return slowest
}
const checkApplications = (name) => assertAnswered(sendRequests(name))
const waitForRecords = async (name) => {
  for (const service of SERVICES) await waitForRecord(`${name}-${service}-19`)
}

/**
 * Retries and drops stay in the state for five minutes after they ended. The
 * requests are judged at the end: `waitFor` would take a slow one for a retry.
 */
async function waitForCollecting(name) {
  const results = []
  const collecting = findState("Collecting")
  await waitFor(
    "the state Collecting",
    () => {
      results.push(...sendRequests(name))
      return readState() === collecting
    },
    10,
  )
  assertAnswered(results)
}

async function checkCollecting() {
  start(...SERVICES, "query", "loki", "alloy", "prometheus", "grafana")
  // Alloy finds the containers within its 15 seconds.
  await waitFor("all three applications in Loki", () => {
    sendRequests("first")
    return SERVICES.every((service) => isStored(`first-${service}-19`))
  })
  await waitForCollecting("first")
  report("collecting: lines are read and delivered")
  await waitForState("No line read", 8)
  report("no matches: a quiet pipeline is not a failure")
}

async function checkShortOutage() {
  const initialRetries = countRetries()
  stop("loki")
  await waitForState("History DOWN")
  const slowest = checkApplications("loki-away")
  report(`Loki stopped: named, applications continue (at most ${slowest} ms)`)
  await waitFor("a retry", () => countRetries() > initialRetries)
  // Two scrapes, so that Prometheus sees the counter rise.
  await sleep(30_000)
  start("loki")
  await waitForRecords("loki-away")
  report("a short Loki outage loses nothing here")
  await waitForState("Retrying")
  report("retries stay visible after Loki is back")
}

async function checkCollectorOutage() {
  stop("alloy")
  await waitForState("Collection DOWN")
  const slowest = checkApplications("alloy-away")
  assert.ok(!isStored("alloy-away-backend-19"))
  report(`Alloy stopped: named, applications continue (at most ${slowest} ms)`)
  start("alloy")
  await waitForRecords("alloy-away")
  report("a returned Alloy reads what Docker still has")
}

async function checkPrometheusOutage() {
  stop("prometheus")
  const slowest = checkApplications("prometheus-away")
  await waitForRecords("prometheus-away")
  report(
    `Prometheus stopped: applications and collection continue (at most ${slowest} ms)`,
  )
  start("prometheus")
}

async function checkGrafanaOutage() {
  await waitFor("Grafana to answer", () => request(`${GRAFANA}/api/health`))
  stop("grafana")
  const slowest = checkApplications("grafana-away")
  await waitForRecords("grafana-away")
  report(
    `Grafana stopped: applications and collection continue (at most ${slowest} ms)`,
  )
  start("grafana")
}

async function checkLongOutage() {
  const countLinesRead = () =>
    readCounter("loki_source_docker_target_entries_total")
  const countDropped = () => readCounter("loki_write_dropped_entries_total")
  const initialLines = countLinesRead()
  const initialDropped = countDropped()
  const initialRetries = countRetries()
  stop("loki")
  // A batch is being retried first, so that nothing is taken out of the queue
  // while the burst fills it.
  checkApplications("long")
  await waitFor("a retry", () => countRetries() > initialRetries)
  const [{ status, ms }] = requestAll([
    `http://backend:3000/?id=burst&count=${BURST}`,
  ])
  assert.equal(status, 200)
  // Reading pauses well below the burst, at what the queue holds.
  await sleep(30_000)
  const linesAtFirst = countLinesRead() - initialLines
  await sleep(60_000)
  const linesLater = countLinesRead() - initialLines
  assert.ok(linesAtFirst < BURST * 0.75, `${linesAtFirst} lines read`)
  assert.equal(linesLater, linesAtFirst, "reading goes on into a full queue")
  report(
    `backlog is bounded: ${linesLater} of ${BURST} lines read, written in ${ms} ms`,
  )
  checkApplications("long-later")
  report("applications continue with a full queue")

  await waitFor("retries to run out", () => countDropped() > initialDropped, 20)
  start("loki")
  await waitForState("DROPPING")
  report("drops are visible")
  await waitForRecord(`burst-${BURST - 1}`, 15)
  report("after the outage the unread backlog arrives")
  checkApplications("end")
  await waitForRecords("end")
  const dropped = countDropped() - initialDropped
  const stored = countStoredBurst()
  // Never a failure: what Docker's follower skips is not counted by Alloy.
  console.log(
    `burst records: ${stored} stored, ${dropped} entries dropped, ` +
      `${Math.max(0, BURST - stored - dropped)} in neither`,
  )
  await waitForCollecting("end")
  report("the state returns to collecting")
}

removeProject()
try {
  await checkCollecting()
  await checkShortOutage()
  await checkCollectorOutage()
  await checkPrometheusOutage()
  await checkGrafanaOutage()
  await checkLongOutage()
} finally {
  removeProject()
}
