// Retained and resumed log history on real, disposable containers (#178):
// first import, position resume, Loki recreation, application-container
// replacement, Docker rotation and retention. Needs Docker and Node, and takes
// up to 30 minutes, most of it waiting for retention. From deploy/monitoring:
//   node tests/log-history/check.mjs
// It creates and removes only the mtogo-log-history-test project.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import {
  createProject,
  report,
  sumCounter,
  waitFor,
} from "../disposable-project.mjs"
import { createRecordLine } from "../record-line.cjs"

// The file itself: the package's own entry needs an installed Winston.
const { createLogRecord } = createRequire(import.meta.url)(
  "../../../../packages/logging/src/record.cjs",
)
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Docker stamps lines and Alloy saves positions: long enough to differ. */
const SETTLE = 3000
const POSITIONS =
  "/var/lib/alloy/data/loki.source.docker.application/positions.yml"
const ALLOY = "http://alloy:12345"
const LOKI = "http://loki:3100"
const RETENTION_LOKI = "http://loki-retention:3100"

const { compose, start, removeProject } = createProject(
  join(import.meta.dirname, "compose.yaml"),
  { COMPOSE_PROFILES: "retention" },
)
const recreate = (service) => start("--force-recreate", service)
const removeContainer = (service) =>
  compose(["rm", "--stop", "--force", service])
const getContainerId = (service) => compose(["ps", "-q", service]).trim()

/** A new container empties its queue when it starts; wait until it has. */
async function replaceBackend() {
  recreate("backend")
  await sleep(SETTLE)
}

/** A genuine record line; `age` is how long ago the application wrote it. */
const createLine = (requestId, age) =>
  createRecordLine(createLogRecord, "backend", requestId, age)
const createIds = (name, count) =>
  Array.from({ length: count }, (_, i) => `${name}-${i}`)
const emit = (...lines) =>
  compose(
    ["exec", "-T", "backend", "sh", "-c", "cat >> /tmp/queue"],
    lines.map((text) => `${text}\n`).join(""),
  )
const emitIds = (ids) => emit(...ids.map((id) => createLine(id)))

/** Runs a fetch inside the private network and returns status and body. */
function request(url, options = {}) {
  const script =
    "fetch(process.argv[1], JSON.parse(process.argv[2]))" +
    ".then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.text() })))"
  const args = ["exec", "-T", "query", "node", "-e", script, url]
  return JSON.parse(compose([...args, JSON.stringify(options)]))
}

/** How many copies of each request ID Loki returns. */
function countCopies(loki = LOKI) {
  const now = Date.now()
  const params = new URLSearchParams({
    query: '{service="backend"}',
    start: `${now - 10 * DAY}000000`,
    end: `${now + HOUR}000000`,
    limit: "5000",
  })
  const { status, body } = request(`${loki}/loki/api/v1/query_range?${params}`)
  assert.equal(status, 200, body)
  const copies = new Map()
  for (const { values } of JSON.parse(body).data.result)
    for (const [, text] of values) {
      const { request_id: id } = JSON.parse(text)
      copies.set(id, (copies.get(id) ?? 0) + 1)
    }
  return copies
}

const waitForRecords = (...ids) =>
  waitFor(`${ids.at(-1)} and the records before it in Loki`, () => {
    const copies = countCopies()
    return ids.every((id) => copies.has(id)) && copies
  })

/** The application container's entry in Alloy's positions file. */
function readPosition() {
  const text = compose(["exec", "-T", "alloy", "cat", POSITIONS])
  const id = getContainerId("backend")
  const entry = text
    .split("? path: ")
    .find((part) => part.startsWith(`cursor-${id}`))
  return entry && { entry, at: Number(entry.match(/: "?(\d+)"?\s*$/)?.[1]) }
}

const readCounter = (url, name, label) =>
  sumCounter(request(`${url}/metrics`).body, name, label)
/** Lines the running Alloy has read from Docker since it started. */
const countLinesRead = () =>
  readCounter(ALLOY, "loki_source_docker_target_entries_total")

async function checkFirstStartup() {
  // The application ran before monitoring existed, in the order it wrote.
  start("backend", "query")
  await sleep(SETTLE)
  emit(
    createLine("expired", 7 * DAY + HOUR),
    createLine("inside-window", 7 * DAY - HOUR),
    ...createIds("before", 30).map((id) => createLine(id)),
  )
  // Positions are whole seconds: the last line gets a second of its own.
  await sleep(SETTLE)
  emitIds(["first"])
  await sleep(SETTLE)
  start("loki", "alloy")
  await waitForRecords("inside-window", ...createIds("before", 30), "first")
  // Loki returns nothing that old, so only Alloy can show that it was dropped.
  assert.equal(
    readCounter(
      ALLOY,
      "loki_process_dropped_lines_total",
      'reason="older_than_seven_days"',
    ),
    1,
  )
  report("first startup imports only available records within seven days")
}

async function checkResume() {
  const before = await waitFor("a saved position", readPosition)
  assert.match(before.entry, /source_service/)
  assert.doesNotMatch(before.entry, /network|__address__/)
  assert.ok(countLinesRead() >= 33, "the first run read the whole log")
  removeContainer("alloy")
  emitIds(["while-away"])
  start("alloy")
  await waitForRecords("inside-window", "first", "while-away")
  const read = countLinesRead()
  assert.ok(read < 10, `${read} lines read: the log was read from the start`)
  const after = await waitFor("a saved position", readPosition)
  assert.ok(after.at >= before.at, "the saved position went back")
  report(`a recreated Alloy resumes (${read} lines read)`)
}

async function checkStorageRecreation() {
  recreate("loki")
  emitIds(["after-loki"])
  await waitForRecords("inside-window", "first", "while-away", "after-loki")
  report("a recreated Loki keeps its history and receives new records")
}

async function checkReplacement() {
  const oldId = getContainerId("backend")
  emitIds(["old-container"])
  await waitForRecords("old-container")
  await replaceBackend()
  assert.notEqual(getContainerId("backend"), oldId)
  emitIds(["new-container"])
  await waitForRecords("first", "old-container", "new-container")
  report("a replaced application container keeps earlier history")

  removeContainer("alloy")
  emitIds(["lost"])
  await replaceBackend()
  start("alloy")
  emitIds(["after-gap"])
  const copies = await waitForRecords("after-gap")
  assert.ok(!copies.has("lost"), "the old container's unread line is gone")
  report("expected gap: a container replaced while Alloy was away")
}

async function checkRotation() {
  // About four rotations, slowly enough for Docker's follower to keep up.
  const followed = createIds("followed", 100)
  for (let part = 0; part < followed.length; part += 10) {
    emitIds(followed.slice(part, part + 10))
    await sleep(SETTLE)
  }
  await waitForRecords(...followed)
  report("collection follows Docker's rotation without losing a record")

  removeContainer("alloy")
  emitIds(createIds("rotated", 400))
  await sleep(SETTLE)
  start("alloy")
  const copies = await waitForRecords("rotated-399")
  assert.ok(!copies.has("rotated-0"), "a rotated record was not expected")
  report("expected gap: records rotated away while Alloy was away")
}

function reportDuplicates() {
  const repeated = [...countCopies()].filter(([, count]) => count > 1)
  console.log(`records a query shows more than once: ${repeated.length}`)
}

async function checkRetention() {
  start("loki-retention")
  const push = (level, requestId, age) => {
    const time = `${Date.now() - age}000000`
    const stream = { service: "backend", env: "production", level }
    const values = [[time, createLine(requestId, age)]]
    const { status } = request(`${RETENTION_LOKI}/loki/api/v1/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ streams: [{ stream, values }] }),
    })
    return status === 204
  }
  // One chunk each: a chunk expires as a whole.
  await waitFor("Loki to accept", () => push("info", "old", 8 * DAY))
  await waitFor("Loki to accept", () => push("warn", "kept", 6 * DAY))
  await waitFor("both records to be stored at first", () => {
    const copies = countCopies(RETENTION_LOKI)
    return copies.has("old") && copies.has("kept")
  })
  const { status } = request(`${RETENTION_LOKI}/flush`, { method: "POST" })
  assert.equal(status, 204)
  await sleep(SETTLE)
  // A restart ships the index, which the Compactor reads; the volume stays.
  recreate("loki-retention")
  const counter =
    "loki_boltdb_shipper_retention_sweeper_chunk_deleted_duration_seconds_count"
  await waitFor(
    "the Compactor to delete the expired chunk",
    () => readCounter(RETENTION_LOKI, counter) > 0,
    30,
  )
  const copies = countCopies(RETENTION_LOKI)
  assert.ok(!copies.has("old"), "the expired record is still stored")
  assert.ok(copies.has("kept"), "a record within seven days was deleted")
  report("retention deletes what expired and keeps the rest")
}

removeProject()
try {
  await checkFirstStartup()
  await checkResume()
  await checkStorageRecreation()
  await checkReplacement()
  await checkRotation()
  reportDuplicates()
  await checkRetention()
} finally {
  removeProject()
}
