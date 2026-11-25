// Fixture check of the approved-events pipeline at the Loki query boundary
// (#176). `write` turns cases.json into a log file stamped with the current
// time; `check` waits for Alloy and then compares what Loki actually stores
// with the expected reconstructions. Plain Node, no dependencies.
const assert = require("node:assert/strict")
const { readFileSync, writeFileSync } = require("node:fs")
const { join } = require("node:path")

const cases = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"))
const [mode, file] = process.argv.slice(2)
const lokiUrl = process.env.LOKI_URL ?? "http://loki:3100"

function stamp(text, now) {
  const time = now.toISOString()
  const timestamp = time.slice(0, 19).replace("T", " ")
  return text
    .replaceAll("{{TIME}}", time)
    .replaceAll("{{TIMESTAMP}}", timestamp)
}

async function query(start) {
  const params = new URLSearchParams({
    query: '{service=~".+"}',
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

async function check() {
  const { now } = JSON.parse(readFileSync(`${file}.meta.json`, "utf8"))
  const expected = cases
    .filter(({ stored }) => stored)
    .map(({ stored }) => stamp(stored, new Date(now)))
  let streams = []
  for (let attempt = 0; attempt < 60; attempt++) {
    streams = await query(now - 60_000).catch(() => [])
    const count = streams.reduce((sum, { values }) => sum + values.length, 0)
    if (count >= expected.length) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  // Give a wrongly forwarded extra line the chance to arrive too.
  await new Promise((resolve) => setTimeout(resolve, 5000))
  streams = await query(now - 60_000)

  const stored = streams.flatMap(({ values }) => values.map(([, line]) => line))
  for (const { stream } of streams)
    assert.deepEqual(Object.keys(stream).sort(), ["env", "level", "service"])
  assert.deepEqual([...stored].sort(), [...expected].sort())
  for (const line of stored) assert.doesNotMatch(line, /SECRET/)
  const timestamps = streams.flatMap(({ values }) => values.map(([ns]) => ns))
  for (const ns of timestamps)
    assert.equal(Number(BigInt(ns) / 1_000_000n), now, "source time kept")

  const byId = await fetch(
    `${lokiUrl}/loki/api/v1/query_range?${new URLSearchParams({
      query: '{service="backend"} | json | request_id="demo-176-failed"',
      start: String((now - 60_000) * 1_000_000),
      end: String((Date.now() + 60_000) * 1_000_000),
    })}`,
  ).then((response) => response.json())
  assert.equal(
    byId.data.result.reduce((sum, { values }) => sum + values.length, 0),
    1,
    "request ID is searchable as a field",
  )
  console.log(
    `approved-events pipeline: ${stored.length} records stored as expected, ` +
      `${cases.length - expected.length} lines excluded`,
  )
}

if (mode === "write") {
  const now = Date.now()
  writeFileSync(
    file,
    cases.map(({ line }) => stamp(line, new Date(now))).join("\n") + "\n",
  )
  writeFileSync(`${file}.meta.json`, JSON.stringify({ now }))
} else if (mode === "check") {
  check().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
} else {
  console.error("usage: node check.cjs write|check <file>")
  process.exit(2)
}
