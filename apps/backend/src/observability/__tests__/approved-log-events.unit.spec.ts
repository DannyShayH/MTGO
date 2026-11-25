import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createLogRecord, logEvents } from "@dtc/logging"

// The Alloy pipeline is the dataset boundary for Loki (#176). These checks keep
// it and its fixture expectations tied to the logging contract in
// @dtc/logging; the real pipeline itself is exercised against Loki by
// deploy/monitoring/tests/log-pipeline (see local-request-monitoring.md).
const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

const pipeline = read("alloy/approved-events.alloy")

type Case = {
  name: string
  // The test design technique (EP, BVA) behind the case.
  reason: string
  line: string
  stored: string | null
}
const cases: Case[] = JSON.parse(read("tests/log-pipeline/cases.json"))
const fixtureTime = {
  time: "2026-11-25T10:11:39.329Z",
  timestamp: "2026-11-25 10:11:39",
}
const fill = (text: string) =>
  text
    .replaceAll("{{TIME}}", fixtureTime.time)
    .replaceAll("{{TIMESTAMP}}", fixtureTime.timestamp)

/** `event|level|msg` combinations the pipeline recognizes, unescaped. */
function recognizedCombinations() {
  const match = pipeline.match(/\(\?P<recognized>(.*?)\)\$`/)
  if (!match) throw new Error("No recognized-event expression in the pipeline")
  // Combinations are alternatives; the bars inside one are escaped.
  return match[1]
    .split(/(?<!\\)\|/)
    .map((combo) => combo.replaceAll("\\|", "|").replaceAll("\\.", "."))
    .sort()
}

/** Every level an event can take in the shared record builder. */
function vocabularyCombinations() {
  return logEvents
    .flatMap((event) => {
      // No status, success, expected 4xx and 5xx: the only inputs that change
      // an event's level (upstream.request.failed is info for 4xx, else warn).
      const levels = new Set(
        [undefined, 200, 404, 503].map(
          (status) =>
            createLogRecord("backend", event, { status }, "production").level,
        ),
      )
      const { msg } = createLogRecord("backend", event, {}, "production")
      return [...levels].map((level) => `${event}|${level}|${msg}`)
    })
    .sort()
}

describe("approved backend events pipeline", () => {
  it("recognizes exactly the event, level and message combinations of the shared vocabulary", () => {
    expect(recognizedCombinations()).toEqual(vocabularyCombinations())
  })

  it("recognizes only backend records in this slice", () => {
    expect(pipeline).toContain("^(?P<ok_service>backend)$")
  })

  it("indexes only service, environment and severity as stream labels", () => {
    const keep = pipeline.match(/stage\.label_keep \{\s*values = \[([^\]]*)\]/)
    expect(keep?.[1].replace(/\s/g, "")).toBe('"service","env","level"')
  })

  it.each([
    "compose.yaml",
    "compose.staging.yaml",
    "tests/log-pipeline/compose.yaml",
  ])("%s pins the Loki and Alloy images", (file) => {
    const compose = read(file)
    expect(compose).toContain("image: grafana/loki:3.7.10")
    expect(compose).toContain("image: grafana/alloy:v1.22.0")
  })
})

describe("approved-event fixtures", () => {
  it("cover kept and dropped lines", () => {
    expect(cases.filter(({ stored }) => stored).length).toBeGreaterThan(3)
    expect(cases.filter(({ stored }) => !stored).length).toBeGreaterThan(3)
    expect(new Set(cases.map(({ name }) => name)).size).toBe(cases.length)
  })

  // The expected stored record must be what the shared builder itself would
  // produce from that record's fields: nothing outside the allowlist survives.
  it.each(cases.filter((fixture) => fixture.stored))(
    "$name ($reason) is stored as the shared builder's reconstruction",
    ({ stored }) => {
      const record = JSON.parse(fill(stored!))
      const { time, service, event, env, level, msg, err, ...fields } = record
      const rebuilt = createLogRecord(service, event, fields, env)
      // The builder classifies a live error; a stored one keeps its class.
      if (rebuilt.err) {
        expect(["Error", "TypeError", "RangeError"]).toContain(err.type)
        expect(err).toEqual({ type: err.type })
      } else expect(err).toBeUndefined()
      expect({ ...rebuilt, time, ...(err && { err }) }).toEqual(record)
      expect(Object.keys(record).slice(0, 6)).toEqual([
        "time",
        "level",
        "service",
        "env",
        "event",
        "msg",
      ])
      expect({ level, msg }).toEqual({ level: rebuilt.level, msg: rebuilt.msg })
    },
  )

  it.each(cases)(
    "$name never stores a synthetic secret marker",
    ({ stored }) => {
      expect(stored ?? "").not.toMatch(/SECRET/)
    },
  )

  it.each(cases)("$name input is one line", ({ line }) => {
    expect(fill(line)).not.toContain("\n")
  })
})
