import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readComposeService } from "./compose-service"

// Log pipeline failures (#179), checked at the configuration the stacks run
// with. The outage itself is exercised on real containers by
// deploy/monitoring/tests/log-outage (see approved-application-events.md).
const root = join(__dirname, "../../../../..")
const readRoot = (path: string) => readFileSync(join(root, path), "utf8")
const read = (path: string) => readRoot(join("deploy/monitoring", path))

const collector = read("alloy/config.alloy")
const prometheus = read("prometheus.yaml")
const promtoolTests = read("tests/dashboard-queries.test.yaml")

const stacks = ["compose.yaml", "compose.staging.yaml"]

describe("bounded buffering, retries and backlog", () => {
  const readSetting = (key: string) =>
    collector.match(new RegExp(`^\\s+${key}\\s*=\\s*(\\S+)$`, "m"))?.[1]

  it.each([
    ["batch_size", '"256KiB"'],
    ["max_backoff_retries", "30"],
    ["max_backoff_period", '"30s"'],
    ["remote_timeout", '"5s"'],
  ])("%s is %s", (key, value) => {
    expect(readSetting(key)).toBe(value)
  })

  // Alloy's default queue holds 10 MiB and pauses reading when it is full.
  // Changing it, or a write-ahead log (bounded by age, not by size), stops
  // Alloy from starting at its default stability level.
  it.each(["queue_config", "wal"])("leaves %s at Alloy's default", (block) => {
    expect(collector).not.toMatch(new RegExp(`^\\s*${block}\\b`, "m"))
  })

  it.each([...stacks, "tests/log-outage/compose.yaml"])(
    "%s gives Alloy longer to stop than the 15 seconds its queue drains",
    (file) => {
      expect(readComposeService(read(file), "alloy")).toContain(
        "stop_grace_period: 30s",
      )
    },
  )
})

describe("applications do not depend on the pipeline", () => {
  const applications = [
    {
      file: "deploy/monitoring/compose.application.yaml",
      services: ["backend", "partner"],
    },
    {
      file: "deploy/staging/compose.yaml",
      services: ["backend", "partner", "storefront"],
    },
  ]

  it.each(applications)(
    "$file logs to a local file and names no pipeline component",
    ({ file, services }) => {
      const compose = readRoot(file)
      for (const service of services)
        expect(readComposeService(compose, service)).toContain(
          "logging: *logging",
        )
      // The only driver is the local file; a network driver could block.
      expect(compose.match(/driver: (?!bridge)\S+/g)).toEqual([
        "driver: json-file",
      ])
      expect(compose).not.toMatch(/^\s+(?:- )?(?:loki|alloy|prometheus):?$/m)
      expect(compose).not.toMatch(/(?:loki|alloy):\d+/)
    },
  )

  it.each(stacks)("%s keeps Loki and Alloy off the applications", (file) => {
    for (const service of ["loki", "alloy"]) {
      const block = readComposeService(read(file), service)
      expect(block).toMatch(/networks:\n {6}- logs\n/)
      expect(block).not.toContain("ports:")
    }
  })
})

describe("collection diagnostics", () => {
  it.each([...stacks, "tests/log-outage/compose.yaml"])(
    "%s lets Prometheus reach Alloy and Loki",
    (file) => {
      const compose = read(file)
      expect(readComposeService(compose, "prometheus")).toMatch(
        /- logs|\[logs\]/,
      )
      const alloy = readComposeService(compose, "alloy")
      expect(alloy).toContain("--server.http.listen-addr=0.0.0.0:12345")
      expect(alloy).toContain("--server.http.enable-pprof=false")
      expect(alloy).toContain("--server.http.disable-support-bundle=true")
    },
  )

  const dashboard = JSON.parse(
    read("grafana/dashboards/application-events.json"),
  )
  type Panel = {
    title: string
    type: string
    datasource?: { type: string }
    description?: string
    options?: { content?: string }
    fieldConfig: {
      defaults: {
        noValue?: string
        mappings: { options: Record<string, { text: string }> }[]
      }
    }
    targets?: { expr: string }[]
  }
  const panels: Panel[] = dashboard.panels
  const health = panels.filter(
    ({ datasource }) => datasource?.type === "prometheus",
  )
  const queries = health.flatMap(({ title, targets }) =>
    (targets ?? []).map(({ expr }) => ({ title, expr })),
  )

  it("shows the pipeline's state, drops, retries and flow above the events", () => {
    expect(health.map(({ title }) => title)).toEqual([
      "Collection state — rolling 5 minutes",
      "Event history (Loki)",
      "Entries dropped — rolling 5 minutes",
      "Delivery retries — rolling 5 minutes",
      "Lines read from the applications — rolling 5 minutes",
      "Events delivered to Loki — rolling 5 minutes",
      "Collection state — over time",
      "Collector and history up — over time",
      "Drops, refusals, retries and read errors — over time, rolling 5 minutes",
    ])
    const events = panels.findIndex(({ type }) => type === "logs")
    expect(panels.indexOf(health[5])).toBeLessThan(events)
  })

  // "No matches" is read from the past, so the past needs the same words.
  it.each([
    "Collection state — rolling 5 minutes",
    "Collection state — over time",
  ])("%s asks the same question with the same words", (title) => {
    const { targets, fieldConfig } = health.find(
      (panel) => panel.title === title,
    )!
    expect(targets!.map(({ expr }) => expr)).toEqual([queries[0].expr])
    expect(fieldConfig.defaults.mappings).toEqual(
      health[0].fieldConfig.defaults.mappings,
    )
  })

  // Which condition gives which number is the promtool file's decision table.
  it("every state has its own words, and missing evidence is none of them", () => {
    const { mappings, noValue } = health[0].fieldConfig.defaults
    const words = Object.entries(mappings[0].options).map(
      ([value, { text }]) => [value, text.split(" — ")[0]],
    )
    expect(words).toEqual([
      ["0", "Collection DOWN"],
      ["1", "History DOWN"],
      ["2", "Insufficient history"],
      ["3", "DROPPING"],
      ["4", "Cannot list containers"],
      ["5", "Retrying"],
      ["6", "No line read in 5 minutes"],
      ["7", "Collecting"],
    ])
    expect(noValue).toMatch(/^Unknown/)
  })

  it.each(queries)("$title is exercised verbatim by promtool", ({ expr }) => {
    expect(promtoolTests).toContain(`- expr: '${expr}'`)
    for (const [range] of expr.matchAll(/\[[^\]]+\]/g))
      expect(range).toBe("[5m]")
  })

  it("scrapes only the series the panels use", () => {
    const jobs = prometheus.split("- job_name: ").slice(1)
    const kept = new Set(
      ["mtogo-alloy", "mtogo-loki"].flatMap((name) => {
        const job = jobs.find((text) => text.startsWith(`${name}\n`)) ?? ""
        expect(job).toContain("action: keep")
        return job.match(/regex: (\S+)/)![1].split("|")
      }),
    )
    const used = queries.flatMap(
      ({ expr }) => expr.match(/\b(?:loki|prometheus)_\w+/g) ?? [],
    )
    expect(kept).toEqual(new Set(used))
  })

  it("explains failed collection, no matches and unavailable history", () => {
    const text = panels.map(({ options }) => options?.content ?? "").join(" ")
    for (const claim of [
      "**No matching events**",
      "**Failed collection**",
      "**Unavailable history**",
      "best effort",
      "not proof",
    ])
      expect(text).toContain(claim)
  })
})
