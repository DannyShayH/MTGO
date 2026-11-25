import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createLogRecord, logEvents } from "@dtc/logging"

// The Alloy pipeline is the dataset boundary for Loki (#176, #177). These checks keep
// it and its fixture expectations tied to the logging contract in
// @dtc/logging; the real pipeline itself is exercised against Loki by
// deploy/monitoring/tests/log-pipeline (see local-request-monitoring.md).
const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

const pipeline = read("alloy/approved-events.alloy")
const collector = read("alloy/config.alloy")

type Service = "backend" | "partner" | "storefront"
const services: Service[] = ["backend", "partner", "storefront"]

type Case = {
  name: string
  // The Compose service whose container wrote the line.
  source: Service
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
    // {{TIME-167H}} is 167 hours earlier; the check script stamps it.
    .replaceAll(/\{\{TIME(?:-\d+H)?\}\}/g, fixtureTime.time)
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

describe("approved application events pipeline", () => {
  it("recognizes exactly the event, level and message combinations of the shared vocabulary", () => {
    expect(recognizedCombinations()).toEqual(vocabularyCombinations())
  })

  // A record's own service must name the container that wrote it, so one app
  // cannot appear in Loki as another.
  it.each(services)(
    "recognizes %s records only from its own container",
    (service) => {
      const blocks = pipeline.split("stage.match {").slice(1)
      const block = blocks.find((text) =>
        text.includes(`selector = "{source_service=\\"${service}\\"}"`),
      )
      expect(block).toContain(`expression = \`^(?P<ok_service>${service})$\``)
    },
  )

  it("recognizes no other service", () => {
    expect(
      [...pipeline.matchAll(/\(\?P<ok_service>([^)]*)\)/g)].map(
        ([, service]) => service,
      ),
    ).toEqual(services)
  })

  it("collects exactly the three application containers", () => {
    expect(collector).toMatch(
      new RegExp(`regex\\s*=\\s*"${services.join("\\|")}"`),
    )
    expect(collector).toMatch(/target_label\s*=\s*"source_service"/)
  })

  it("indexes only service, environment and severity as stream labels", () => {
    const keep = pipeline.match(/stage\.label_keep \{\s*values = \[([^\]]*)\]/)
    expect(keep?.[1].replace(/\s/g, "")).toBe('"service","env","level"')
  })

  it.each([
    "compose.yaml",
    "compose.staging.yaml",
    "tests/log-pipeline/compose.yaml",
    "tests/log-history/compose.yaml",
  ])("%s pins the Loki and Alloy images", (file) => {
    const compose = read(file)
    expect(compose).toContain("image: grafana/loki:3.7.10")
    expect(compose).toContain("image: grafana/alloy:v1.22.0")
  })
})

describe("approved-event fixtures", () => {
  it.each(services)("keep genuine %s records", (service) => {
    expect(
      cases.filter(
        ({ source, stored }) =>
          source === service &&
          stored &&
          JSON.parse(stored).service === service,
      ).length,
    ).toBeGreaterThan(1)
  })

  it("drop a record whose service is not the container that wrote it", () => {
    const spoofed = cases.filter(
      ({ source, line }) =>
        line.startsWith("{") && JSON.parse(fill(line)).service !== source,
    )
    expect(spoofed.length).toBeGreaterThan(1)
    for (const { stored } of spoofed) expect(stored).toBeNull()
  })

  // Loki accepts a stream's records in time order only, within an hour.
  it("cover both sides of the seven-day import window, oldest first", () => {
    const aged = cases.map(({ line, stored }) => ({
      hours: Number(line.match(/\{\{TIME-(\d+)H\}\}/)?.[1] ?? 0),
      isKept: stored !== null,
    }))
    expect(aged.filter(({ hours }) => hours > 0)).toEqual([
      { hours: 169, isKept: false },
      { hours: 167, isKept: true },
    ])
    expect(aged.slice(0, 2).map(({ hours }) => hours)).toEqual([169, 167])
  })

  it("cover kept and dropped lines", () => {
    expect(cases.filter(({ stored }) => stored).length).toBeGreaterThan(3)
    expect(cases.filter(({ stored }) => !stored).length).toBeGreaterThan(3)
    expect(new Set(cases.map(({ name }) => name)).size).toBe(cases.length)
  })

  // The expected stored record must be what the shared builder itself would
  // produce from that record's fields: nothing outside the allowlist survives.
  it.each(cases.filter((fixture) => fixture.stored))(
    "$name ($reason) is stored as the shared builder's reconstruction",
    ({ source, stored }) => {
      const record = JSON.parse(fill(stored!))
      expect(record.service).toBe(source)
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
