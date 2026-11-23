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

  // String literals are skipped: a validation regex's [0-9] is not a range.
  it.each(queries)("$title uses five-minute windows only", ({ expr }) => {
    const outsideStrings = expr.replace(/"(?:[^"\\]|\\.)*"/g, '""')
    for (const [range] of outsideStrings.matchAll(/\[[^\]]+\]/g))
      expect(range).toBe("[5m]")
  })

  const promtoolCase = (expr: string) => `- expr: '${expr.replace(/'/g, "''")}'`

  // The promtool file carries the semantic oracle (zero denominators, DOWN,
  // absent targets, insufficient history, resets); it must test these exact
  // expressions, not a drifted copy.
  it.each(queries.filter(({ expr }) => !expr.includes("${")))(
    "$title is exercised verbatim by the promtool query tests",
    ({ expr }) => {
      expect(promtoolTests).toContain(promtoolCase(expr))
    },
  )

  const thresholdControl = "low_traffic_threshold"

  // Grafana 13.3.1 (Scenes) "percentencode": encodeURIComponent, then
  // !'()* as %XX, and a multi-value array as "{a,b}". A textbox keeps the
  // first of repeated URL parameters today; the array case guards a change.
  const percentEncode = (value: string | string[]) =>
    encodeURIComponent(
      Array.isArray(value) ? `{${value.join(",")}}` : value,
    ).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )

  // Equivalence and boundary classes from control or URL input. The promtool
  // file is the oracle: it holds the expected state of each in the pinned
  // query engine (README: deploy/monitoring/README.md).
  const viewerInputs: { input: string | string[]; reason: string }[] = [
    { input: "0", reason: "EP valid, BVA lowest: 0 turns the indication off" },
    { input: "99", reason: "BVA: just below a count of 100" },
    { input: "100", reason: "BVA: equal to a count of 100 is not low" },
    { input: "101", reason: "BVA: just above a count of 100 is low" },
    { input: "750", reason: "EP valid: an arbitrary larger whole number" },
    { input: "999999999999999", reason: "BVA highest valid: 15 digits" },
    {
      input: "1000000000000000",
      reason: "BVA lowest invalid: 16 digits, unrepresentable",
    },
    { input: "-1", reason: "EP invalid, BVA: negative, just below 0" },
    { input: "1.5", reason: "EP invalid: fractional" },
    {
      input: "100.0",
      reason: "EP invalid: unsupported decimal representation",
    },
    { input: "1e3", reason: "EP invalid: unsupported exponent representation" },
    {
      input: "0x10",
      reason: "EP invalid: unsupported hexadecimal representation",
    },
    { input: "+5", reason: "EP invalid: unsupported signed representation" },
    { input: "007", reason: "EP invalid: unsupported leading zeros" },
    { input: "1_000", reason: "EP invalid: unsupported digit separator" },
    { input: " 100", reason: "EP invalid: surrounding whitespace" },
    { input: "", reason: "EP invalid: empty" },
    { input: "abc", reason: "EP invalid: nonnumeric" },
    { input: "Infinity", reason: "EP invalid: non-finite" },
    { input: "NaN", reason: "EP invalid: not a number" },
    { input: "100) or vector(1", reason: "EP invalid: PromQL expression" },
    {
      input: '100"} or vector(1) #',
      reason: "EP invalid: string-escaping expression",
    },
    { input: "$1", reason: "EP invalid: label_replace reference" },
    { input: ["100", "750"], reason: "EP invalid: multiple values" },
  ]

  it.each(
    queries
      .filter(({ expr }) => expr.includes("${"))
      .flatMap(({ title, expr }) =>
        viewerInputs.map(({ input, reason }) => ({
          title,
          input: JSON.stringify(input),
          reason,
          expr: expr.replaceAll(
            `\${${thresholdControl}:percentencode}`,
            percentEncode(input),
          ),
        })),
      ),
  )(
    "$title is exercised by promtool for viewer input $input ($reason)",
    ({ expr }) => {
      expect(expr).not.toContain("${")
      expect(promtoolTests).toContain(promtoolCase(expr))
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

  describe("streams and interrupted requests, apart from ordinary API panels", () => {
    const separate = panels.filter(({ title }) =>
      /^(Server-sent event|Interrupted requests)/.test(title),
    )

    it.each([
      {
        title: /^Server-sent event connections — active now$/,
        metric: /mtogo_sse_connections_active\{job="mtogo-backend"\}/,
        reason: "EP: established streams still open",
      },
      {
        title: /^Server-sent event terminations — rolling 5 minutes$/,
        metric:
          /increase\(mtogo_sse_connections_closed_total\{job="mtogo-backend"\}\[5m\]\)/,
        reason: "EP: established streams that ended",
      },
      {
        title: /^Interrupted requests — rolling 5 minutes$/,
        metric:
          /increase\(mtogo_http_requests_interrupted_total\{job="mtogo-backend"\}\[5m\]\)/,
        reason: "EP: ordinary requests closed before a completed response",
      },
    ])("$reason: shows $title as a stat and over time", ({ title, metric }) => {
      const shown = separate.filter((panel) => title.test(panel.title))
      expect(shown.map(({ type }) => type).sort()).toEqual([
        "stat",
        "timeseries",
      ])
      for (const panel of shown)
        expect(panel.targets!.some(({ expr }) => metric.test(expr))).toBe(true)
    })

    it.each(
      separate.flatMap(({ title, targets }) =>
        (targets ?? []).map(({ expr }) => ({ title, expr })),
      ),
    )("$title only shows a currently scraped target", ({ expr }) => {
      expect(expr).toMatch(
        / and on\(job, instance\) \(up\{job="mtogo-backend"\} == 1\)\)$/,
      )
    })

    // Ordinary panels must never mix stream lifetimes or interruptions in.
    it.each(
      queries.filter(
        ({ title }) => !/^(Server-sent event|Interrupted requests)/.test(title),
      ),
    )("$title reads no stream or interruption series", ({ expr }) => {
      expect(expr).not.toMatch(/mtogo_sse_|interrupted/)
    })

    it("explains why they are separate and what a disconnect means", () => {
      const text = JSON.stringify(
        panels.find(
          ({ title }) => title === "Streams and interrupted requests",
        ),
      )
      for (const claim of [
        "not in the completed response",
        "no HTTP status",
        "not an application error",
        "refused stream",
      ])
        expect(text).toContain(claim)
    })
  })

  describe("viewer-tuned low-traffic indication", () => {
    const indication = panels.find(
      ({ title }) => title === "Low-traffic indication — rolling 5 minutes",
    )

    it("offers a textbox control whose shared default in Git is 0 (off)", () => {
      const variable = dashboard.templating.list.find(
        ({ name }: { name: string }) => name === thresholdControl,
      )
      expect(variable).toMatchObject({ type: "textbox", query: "0" })
      expect(variable.current).toMatchObject({ value: "0" })
      // A Viewer changes only the current view and URL; Git stays authoritative.
      expect(dashboard.editable).toBe(false)
    })

    // Raw interpolation would execute "100) or vector(1" as PromQL. Percent
    // encoding leaves only [A-Za-z0-9-_.~%], which cannot leave the string or
    // become a label_replace "$1" reference.
    it("interpolates the control only as a percent-encoded PromQL string", () => {
      const uses = JSON.stringify(dashboard).match(
        new RegExp(`.{0,2}\\$\\{?${thresholdControl}[^"\\\\]*.{0,2}`, "g"),
      )
      expect(uses?.length).toBeGreaterThan(0)
      expect(new Set(uses)).toEqual(
        new Set([`\\"\${${thresholdControl}:percentencode}\\"`]),
      )
      expect(indication?.targets?.length).toBe(1)
    })

    // The promtool oracle returns these state numbers; each needs its words.
    it.each([
      { state: "0", text: /^Configuration error — / },
      { state: "1", text: /^Unavailable — / },
      { state: "2", text: /^Off — threshold 0$/ },
      { state: "3", text: /^Not low — / },
      { state: "4", text: /^LOW traffic — .*p95 with its observation count$/ },
    ])("labels state $state as $text", ({ state, text }) => {
      const mappings = (
        indication as Panel & {
          fieldConfig: {
            defaults: {
              mappings: { options: Record<string, { text: string }> }[]
            }
          }
        }
      ).fieldConfig.defaults.mappings
      expect(mappings[0].options[state].text).toMatch(text)
    })

    it("evaluates at the end of any displayed range, on the five-minute count", () => {
      const [target] = indication!.targets! as {
        expr: string
        instant?: boolean
      }[]
      expect(target.instant).toBe(true)
      expect(target.expr).toContain(
        'sum(increase(mtogo_http_requests_total{job="mtogo-backend"}[5m]) and on(job, instance) (up{job="mtogo-backend"} == 1))',
      )
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
