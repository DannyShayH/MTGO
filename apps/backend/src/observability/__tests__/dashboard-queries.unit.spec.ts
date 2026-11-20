import { readFileSync } from "node:fs"
import { join } from "node:path"

const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

type Panel = {
  title: string
  type: string
  targets?: { expr: string }[]
  fieldConfig?: { defaults: { unit?: string } }
}

const dashboard = JSON.parse(read("grafana/dashboards/backend-requests.json"))
const panels: Panel[] = dashboard.panels
const queries = panels.flatMap((panel) =>
  (panel.targets ?? []).map(({ expr }) => ({ title: panel.title, expr })),
)
const promtoolTests = read("tests/dashboard-queries.test.yaml")

describe("provisioned backend dashboard queries", () => {
  it("refreshes every 30 seconds against a 15-second scrape", () => {
    expect(dashboard.refresh).toBe("30s")
    expect(read("prometheus.yaml")).toMatch(/^\s+scrape_interval: 15s$/m)
  })

  // Two scrape intervals: a late scrape must not blank every gated panel.
  it.each(["compose.yaml", "compose.staging.yaml"])(
    "%s keeps current evidence for two 15-second scrapes",
    (file) => {
      expect(read(file)).toContain("--query.lookback-delta=30s")
    },
  )

  it("covers rates, counts, 5xx proportion and p95 with its observation count", () => {
    const titles = panels.map(({ title }) => title)
    for (const expected of [
      /^Completed response rate — rolling 5 minutes$/,
      /^Estimated completed responses — rolling 5 minutes$/,
      /^5xx proportion — rolling 5 minutes$/,
      /^Ordinary API p95 response time — rolling 5 minutes$/,
      /^Duration observations behind the p95 — rolling 5 minutes$/,
      /^Data state — rolling 5 minutes$/,
    ])
      expect(titles).toContainEqual(expect.stringMatching(expected))
  })

  it.each(queries)("$title uses five-minute windows only", ({ expr }) => {
    for (const [range] of expr.matchAll(/\[[^\]]+\]/g))
      expect(range).toBe("[5m]")
  })

  // The promtool file carries the semantic oracle (zero denominators, DOWN,
  // absent targets, insufficient history, resets); it must test these exact
  // expressions, not a drifted copy.
  it.each(queries)(
    "$title is exercised verbatim by the promtool query tests",
    ({ expr }) => {
      expect(promtoolTests).toContain(`- expr: '${expr.replace(/'/g, "''")}'`)
    },
  )

  // A 0–1 ratio with an auto-scaled axis shows an all-zero series as 0–10000%.
  it("draws the 5xx proportion on a fixed 0–100% axis", () => {
    const chart = panels.find(
      ({ title, type }) =>
        title === "5xx proportion — rolling 5 minutes" && type === "timeseries",
    ) as Panel & { fieldConfig: { defaults: { min?: number; max?: number } } }
    expect(chart.fieldConfig.defaults).toMatchObject({
      unit: "percentunit",
      min: 0,
      max: 1,
    })
  })

  describe("HTTP-serving process panels", () => {
    const processPanels = panels.filter(({ title }) =>
      title.startsWith("HTTP-serving process"),
    )

    it.each([
      {
        title: /^HTTP-serving process CPU — cores used, rolling 5 minutes$/,
        metric:
          /rate\(process_cpu_seconds_total\{job="mtogo-backend"\}\[5m\]\)/,
        unit: "suffix: cores",
        reason: "EP: CPU demand as cores used, not host utilization",
      },
      {
        title: /^HTTP-serving process memory — bytes$/,
        metric: /process_resident_memory_bytes\{job="mtogo-backend"\}/,
        unit: "bytes",
        reason: "EP: memory pressure as a byte gauge",
      },
      {
        title:
          /^HTTP-serving process event-loop delay — seconds, per scrape window$/,
        metric: /nodejs_eventloop_lag_p99_seconds\{job="mtogo-backend"\}/,
        unit: "s",
        reason: "EP: delayed request processing as a seconds gauge",
      },
    ])(
      "$reason: shows $title in its unit, as a stat and over time",
      ({ title, metric, unit }) => {
        const shown = processPanels.filter((panel) => title.test(panel.title))
        expect(shown.map(({ type }) => type).sort()).toEqual([
          "stat",
          "timeseries",
        ])
        for (const panel of shown) {
          expect(panel.fieldConfig?.defaults.unit).toBe(unit)
          expect(panel.targets!.some(({ expr }) => metric.test(expr))).toBe(
            true,
          )
        }
      },
    )

    it("shows resident, heap used and heap total memory over time", () => {
      const memory = processPanels.find(
        ({ title, type }) =>
          title === "HTTP-serving process memory — bytes" &&
          type === "timeseries",
      )!
      const exprs = memory.targets!.map(({ expr }) => expr).join(" ")
      for (const metric of [
        "process_resident_memory_bytes",
        "nodejs_heap_size_used_bytes",
        "nodejs_heap_size_total_bytes",
      ])
        expect(exprs).toContain(`${metric}{job="mtogo-backend"}`)
    })

    // No current evidence must read as unavailable, never as a stale value.
    it.each(
      processPanels.flatMap(({ title, targets }) =>
        (targets ?? []).map(({ expr }) => ({ title, expr })),
      ),
    )("$title only shows a currently scraped target", ({ expr }) => {
      expect(expr).toMatch(
        / and on\(job, instance\) \(up\{job="mtogo-backend"\} == 1\)$/,
      )
    })

    it("names the scraped target and its limits next to the panels", () => {
      const scope = panels.find(
        ({ title }) => title === "HTTP-serving process scope",
      )
      const text = JSON.stringify(scope)
      for (const claim of [
        "`backend-metrics:9464`",
        "not host utilization",
        "1 = one full CPU core",
        "separate worker",
        "Next.js",
        "PostgreSQL",
        "Redis",
      ])
        expect(text).toContain(claim)
    })
  })

  it("states that HTTP latency is not Order processing time", () => {
    const text = panels
      .filter(({ type }) => type === "text")
      .map((panel) => JSON.stringify(panel))
      .join(" ")
    expect(text).toContain("not Order processing time")
  })
})
