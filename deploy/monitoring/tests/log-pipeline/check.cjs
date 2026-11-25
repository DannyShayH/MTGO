// Fixture check of the approved-events pipeline at the Loki query boundary
// (#176, #177, #178). `write` turns cases.json into one log file per source
// container (backend, partner, storefront) stamped with the current time;
// `check` waits for Alloy and then compares what Loki actually stores with the
// expected reconstructions. `{{TIME-167H}}` is 167 hours earlier; old cases come
// first in cases.json, as an application writes them. Plain Node, no dependencies.
const assert = require("node:assert/strict")
const { readFileSync, writeFileSync } = require("node:fs")
const { join } = require("node:path")

const cases = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"))
const sources = ["backend", "partner", "storefront"]
const [mode, dir] = process.argv.slice(2)
const lokiUrl = process.env.LOKI_URL ?? "http://loki:3100"
const alloyUrl = process.env.ALLOY_URL ?? "http://alloy:12345"
const HOUR = 3_600_000
const EVERY_STREAM = '{service=~".+"}'

function stamp(text, now) {
  const before = (hours) => new Date(now - hours * HOUR).toISOString()
  const timestamp = before(0).slice(0, 19).replace("T", " ")
  return text
    .replaceAll(/\{\{TIME(?:-(\d+)H)?\}\}/g, (_, hours = 0) => before(hours))
    .replaceAll("{{TIMESTAMP}}", timestamp)
}

async function query(expr, start) {
  const params = new URLSearchParams({
    query: expr,
    start: String(start * 1_000_000),
    end: String((Date.now() + 60_000) * 1_000_000),
    direction: "forward",
    limit: "1000",
  })
  const response = await fetch(`${lokiUrl}/loki/api/v1/query_range?${params}`)
  if (!response.ok)
    throw new Error(`Loki query failed: HTTP ${response.status}`)
  return (await response.json()).data.result
}

const countEntries = (streams) =>
  streams.reduce((sum, { values }) => sum + values.length, 0)

async function check() {
  const { now } = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"))
  const start = now - 8 * 24 * HOUR
  const expected = cases
    .filter(({ stored }) => stored)
    .map(({ stored }) => stamp(stored, new Date(now)))
  let streams = []
  for (let attempt = 0; attempt < 60; attempt++) {
    streams = await query(EVERY_STREAM, start).catch(() => [])
    if (countEntries(streams) >= expected.length) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  // Give a wrongly forwarded extra line the chance to arrive too.
  await new Promise((resolve) => setTimeout(resolve, 5000))
  streams = await query(EVERY_STREAM, start)

  const stored = streams.flatMap(({ values }) => values.map(([, line]) => line))
  for (const { stream, values } of streams) {
    assert.deepEqual(Object.keys(stream).sort(), ["env", "level", "service"])
    // The indexed service is the record's own, which is its container's.
    for (const [, line] of values)
      assert.equal(JSON.parse(line).service, stream.service, "service label")
  }
  assert.deepEqual([...stored].sort(), [...expected].sort())
  for (const line of stored) assert.doesNotMatch(line, /SECRET/)
  for (const { values } of streams)
    for (const [ns, line] of values)
      assert.equal(
        Number(BigInt(ns) / 1_000_000n),
        Date.parse(JSON.parse(line).time),
        "source time kept",
      )
  assert.deepEqual(
    [...new Set(streams.map(({ stream }) => stream.service))].sort(),
    sources,
    "every application has stored records",
  )

  assert.equal(
    countEntries(
      await query(
        '{service="backend"} | json | request_id="demo-176-failed"',
        start,
      ),
    ),
    1,
    "request ID is searchable as a field",
  )
  // The existing partner sign-in correlation: one ID across both apps.
  const correlated = await query(
    '{service=~".+"} | json | request_id="demo-177-signin"',
    start,
  )
  assert.deepEqual(
    correlated.map(({ stream }) => stream.service).sort(),
    ["backend", "partner"],
    "request ID is searchable across applications",
  )
  // Loki returns nothing over seven days old, so only Alloy can show that the
  // pipeline itself dropped it.
  const metrics = await (await fetch(`${alloyUrl}/metrics`)).text()
  assert.match(
    metrics,
    /^loki_process_dropped_lines_total\{[^}]*reason="older_than_seven_days"[^}]*\} 1$/m,
    "exactly one record was too old to import",
  )

  console.log(
    `approved-events pipeline: ${stored.length} records stored as expected, ` +
      `${cases.length - expected.length} lines excluded`,
  )
}

if (mode === "write") {
  const now = Date.now()
  for (const source of sources)
    writeFileSync(
      join(dir, `${source}.log`),
      cases
        .filter((fixture) => fixture.source === source)
        .map(({ line }) => stamp(line, new Date(now)))
        .join("\n") + "\n",
    )
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ now }))
} else if (mode === "check") {
  check().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
} else {
  console.error("usage: node check.cjs write|check <fixture directory>")
  process.exit(2)
}
