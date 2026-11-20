import { readFileSync } from "node:fs"
import { join } from "node:path"

const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

type Panel = {
  title: string
  type: string
  targets?: { expr: string }[]
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

  it("states that HTTP latency is not Order processing time", () => {
    const text = panels
      .filter(({ type }) => type === "text")
      .map((panel) => JSON.stringify(panel))
      .join(" ")
    expect(text).toContain("not Order processing time")
  })
})
