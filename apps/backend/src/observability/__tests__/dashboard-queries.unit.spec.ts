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

  // Viewer controls, each interpolated into the traffic indications.
  const LOW_CONTROL = "low_traffic_threshold"
  const WARNING_CONTROL = "high_traffic_warning"
  const HIGH_CONTROL = "high_traffic_threshold"
  const controls = [LOW_CONTROL, WARNING_CONTROL, HIGH_CONTROL]

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

  // Equivalence and boundary classes of a threshold from control or URL
  // input, used for both the Low traffic below and High traffic above boxes.
  const thresholdInputs: { input: string | string[]; reason: string }[] = [
    { input: "0", reason: "EP valid, BVA lowest: 0" },
    { input: "99", reason: "BVA: just below a count of 100" },
    { input: "100", reason: "BVA: equal to a count of 100" },
    { input: "101", reason: "BVA: just above a count of 100" },
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

  // The enable control is a dropdown, but a URL can carry any value.
  const warningInputs: { input: string | string[]; reason: string }[] = [
    { input: "off", reason: "EP valid: disabled, the Git default" },
    { input: "on", reason: "EP valid: enabled" },
    { input: "", reason: "EP invalid: empty" },
    { input: "ON", reason: "EP invalid: wrong case" },
    { input: "true", reason: "EP invalid: another boolean spelling" },
    { input: "1", reason: "EP invalid: numeric" },
    { input: "on ", reason: "EP invalid: trailing whitespace" },
    { input: "on) or vector(1", reason: "EP invalid: PromQL expression" },
    { input: ["off", "on"], reason: "EP invalid: multiple values" },
  ]

  type ControlValues = Record<"low" | "warning" | "high", string | string[]>
  type Setting = ControlValues & { reason: string }
  const controlOf: Record<keyof ControlValues, string> = {
    low: LOW_CONTROL,
    warning: WARNING_CONTROL,
    high: HIGH_CONTROL,
  }

  // Each class varies one control from the Git defaults (low 0, warning
  // off, high 0) or, for the high value, from an enabled warning; the
  // cross-field rows hold both bounds valid. The promtool file is the oracle:
  // it holds the expected state of each in the pinned query engine
  // (README: deploy/monitoring/README.md).
  const settings: Setting[] = [
    ...thresholdInputs.map(({ input, reason }) => ({
      low: input,
      warning: "off",
      high: "0",
      reason: `low ${reason}`,
    })),
    ...thresholdInputs.map(({ input, reason }) => ({
      low: "0",
      warning: "on",
      high: input,
      reason: `enabled high ${reason}`,
    })),
    ...warningInputs.map(({ input, reason }) => ({
      low: "0",
      warning: input,
      high: "0",
      reason: `warning ${reason}`,
    })),
    {
      low: "100",
      warning: "on",
      high: "500",
      reason: "cross-field valid: the specified bounds",
    },
    {
      low: "100",
      warning: "on",
      high: "100",
      reason: "cross-field BVA valid: equal bounds",
    },
    {
      low: "99",
      warning: "on",
      high: "100",
      reason: "cross-field BVA valid: low one below high",
    },
    {
      low: "101",
      warning: "on",
      high: "100",
      reason: "cross-field BVA invalid: low one above high",
    },
    {
      low: "100",
      warning: "on",
      high: "50",
      reason: "cross-field invalid: reversed bounds",
    },
    {
      low: "100",
      warning: "off",
      high: "50",
      reason: "cross-field EP: a disabled high is not compared",
    },
    {
      low: "100",
      warning: "off",
      high: "abc",
      reason: "EP invalid: a disabled high is still validated",
    },
    {
      low: "abc",
      warning: "on",
      high: "50",
      reason: "EP invalid: an invalid low is reported before the bounds",
    },
    {
      low: "750",
      warning: "on",
      high: "1000",
      reason: "EP valid: arbitrary larger bounds",
    },
  ]

  const substitute = (expr: string, setting: Setting) =>
    (Object.keys(controlOf) as (keyof ControlValues)[]).reduce(
      (filled, key) =>
        filled.replaceAll(
          `\${${controlOf[key]}:percentencode}`,
          percentEncode(setting[key]),
        ),
      expr,
    )

  it.each(
    queries
      .filter(({ expr }) => expr.includes("${"))
      .flatMap(({ title, expr }) =>
        settings.map((setting) => ({
          title,
          values: JSON.stringify([setting.low, setting.warning, setting.high]),
          reason: setting.reason,
          expr: substitute(expr, setting),
        })),
      ),
  )(
    "$title is exercised by promtool for low, warning, high $values ($reason)",
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

  describe("viewer-tuned low- and high-traffic indications", () => {
    const variable = (name: string) =>
      dashboard.templating.list.find(
        (control: { name: string }) => control.name === name,
      )
    const indications = [
      "Low-traffic indication — rolling 5 minutes",
      "High-traffic indication — rolling 5 minutes",
    ].map((title) => panels.find((panel) => panel.title === title)!)

    it("offers a Low traffic below textbox whose shared default in Git is 0 (off)", () => {
      expect(variable(LOW_CONTROL)).toMatchObject({
        type: "textbox",
        query: "0",
        current: { value: "0" },
      })
      // A Viewer changes only the current view and URL; Git stays authoritative.
      expect(dashboard.editable).toBe(false)
    })

    it("starts the high-traffic warning disabled, with an explicit enable control", () => {
      const warning = variable(WARNING_CONTROL)
      expect(warning).toMatchObject({
        type: "custom",
        multi: false,
        includeAll: false,
        current: { value: "off" },
      })
      expect(
        warning.options.map(({ value }: { value: string }) => value),
      ).toEqual(["off", "on"])
    })

    it("offers a High traffic above textbox whose shared default in Git is 0", () => {
      expect(variable(HIGH_CONTROL)).toMatchObject({
        type: "textbox",
        query: "0",
        current: { value: "0" },
      })
    })

    // Raw interpolation would execute "100) or vector(1" as PromQL. Percent
    // encoding leaves only [A-Za-z0-9-_.~%], which cannot leave the string or
    // become a label_replace "$1" reference.
    it.each(controls)(
      "interpolates %s only as a percent-encoded PromQL string",
      (control) => {
        const uses = JSON.stringify(dashboard).match(
          new RegExp(`.{0,2}\\$\\{?${control}[^"\\\\]*.{0,2}`, "g"),
        )
        expect(uses?.length).toBeGreaterThan(0)
        expect(new Set(uses)).toEqual(
          new Set([`\\"\${${control}:percentencode}\\"`]),
        )
      },
    )

    // The promtool oracle returns these state numbers; each needs its words.
    const mappingsOf = (panel: Panel) =>
      (
        panel as Panel & {
          fieldConfig: {
            defaults: {
              mappings: { options: Record<string, { text: string }> }[]
            }
          }
        }
      ).fieldConfig.defaults.mappings[0].options
    // Configuration errors and missing data read the same on both panels.
    const sharedStateLabels = [
      {
        state: "0",
        text: /^Configuration error — invalid Low traffic below$/,
        reason: "EP invalid: low threshold",
      },
      {
        state: "1",
        text: /^Unavailable — /,
        reason: "EP: no valid count, whatever the settings",
      },
      {
        state: "5",
        text: /^Configuration error — invalid high-traffic /,
        reason: "EP invalid: warning switch or high threshold",
      },
      {
        state: "6",
        text: /^Configuration error — Low above High$/,
        reason: "cross-field EP invalid: reversed bounds",
      },
    ]
    it.each(
      [
        ...sharedStateLabels.map((row) => ({ panel: 0, ...row })),
        ...sharedStateLabels.map((row) => ({ panel: 1, ...row })),
        {
          panel: 0,
          state: "2",
          text: /^Off — threshold 0$/,
          reason: "EP valid: low 0 is off",
        },
        {
          panel: 0,
          state: "3",
          text: /^Not low — /,
          reason: "BVA: at or above the low threshold",
        },
        {
          panel: 0,
          state: "4",
          text: /^LOW traffic — .*p95 with its observation count$/,
          reason: "BVA: strictly below the low threshold",
        },
        {
          panel: 1,
          state: "2",
          text: /^Off — warning disabled$/,
          reason: "EP valid: the warning disabled",
        },
        {
          panel: 1,
          state: "3",
          text: /^Not high — /,
          reason: "BVA: at or below an enabled high threshold",
        },
        {
          panel: 1,
          state: "4",
          text: /^HIGH traffic — /,
          reason: "BVA: strictly above an enabled high threshold",
        },
      ].map((row) => ({ ...row, title: indications[row.panel].title })),
    )(
      "labels $title state $state as $text ($reason)",
      ({ panel, state, text }) => {
        expect(mappingsOf(indications[panel])[state].text).toMatch(text)
      },
    )

    it.each(indications)(
      "$title evaluates at the end of any displayed range, on the five-minute count",
      ({ targets }) => {
        const [target] = targets! as { expr: string; instant?: boolean }[]
        expect(targets).toHaveLength(1)
        expect(target.instant).toBe(true)
        expect(target.expr).toContain(
          'sum(increase(mtogo_http_requests_total{job="mtogo-backend"}[5m]) and on(job, instance) (up{job="mtogo-backend"} == 1))',
        )
      },
    )
  })

  it("states that HTTP latency is not Order processing time", () => {
    const text = panels
      .filter(({ type }) => type === "text")
      .map((panel) => JSON.stringify(panel))
      .join(" ")
    expect(text).toContain("not Order processing time")
  })
})
