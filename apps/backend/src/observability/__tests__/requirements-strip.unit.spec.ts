import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  NEUTRAL,
  flattenRows,
  pickColor,
  readRequestDashboard,
  type ThresholdStep,
} from "./dashboard"

const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const readMonitoringFile = (path: string) =>
  readFileSync(join(monitoring, path), "utf8")

const dashboard = readRequestDashboard()
const events = JSON.parse(
  readMonitoringFile("grafana/dashboards/application-events.json"),
)
const promtoolTests = readMonitoringFile("tests/dashboard-queries.test.yaml")
const promtoolCase = (expr: string) => `- expr: '${expr.replace(/'/g, "''")}'`

const requestPanels = flattenRows(dashboard.panels)
const eventPanels = flattenRows(events.panels)

// The strip is every panel between the Requirements row and the next row.
const topLevel = dashboard.panels
const stripRow = topLevel.findIndex(({ title }) => title === "Requirements")
const nextRow = topLevel.findIndex(
  ({ type }, index) => index > stripRow && type === "row",
)
const strip = topLevel.slice(stripRow + 1, nextRow)
const findStat = (title: string) => {
  const panel = strip.find((candidate) => candidate.title === title)
  expect(panel).toBeDefined()
  return panel!
}

// Targets from ADR-0014, the staging backend cap and the #182 floor; each
// row names the panel whose query and colouring the stat reuses.
const BACKEND_CAP_BYTES = 768 * 1024 * 1024
const requirements = [
  {
    title: "Browsing p95 within 2 s",
    anchor: "browsing-p95",
    source: "Ordinary API p95 response time — rolling 5 minutes",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "green", value: 0 },
      { color: "orange", value: 2 },
      { color: "red", value: 5 },
    ],
    reason: "EP: within, near and beyond the ADR-0014 browsing target of 2 s",
  },
  {
    title: "Order submission p95 within 5 s",
    anchor: "order-submission-p95",
    source: "Ordinary API p95 by route pattern — rolling 5 minutes",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "green", value: 0 },
      { color: "red", value: 5 },
    ],
    reason: "EP: within and beyond the ADR-0014 Order submission target of 5 s",
  },
  {
    title: "Server failures (5xx)",
    anchor: "server-failures",
    source: "5xx proportion — rolling 5 minutes",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "green", value: 0 },
      { color: "orange", value: 0.000001 },
    ],
    reason: "EP: 0 % is healthy, any server failure is worth a look",
  },
  {
    title: "Event-loop delay p99",
    anchor: "event-loop-delay",
    source:
      "HTTP-serving process event-loop delay — seconds, per scrape window",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "green", value: 0 },
      { color: "orange", value: 0.1 },
      { color: "red", value: 1 },
    ],
    reason: "EP: healthy, waiting from 0.1 s and stalled from 1 s (#246)",
  },
  {
    title: "Backend memory, 768 MiB cap",
    anchor: "backend-memory",
    source: "HTTP-serving process memory — bytes",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "green", value: 0 },
      { color: "orange", value: Math.round(BACKEND_CAP_BYTES * 0.8) },
      { color: "red", value: Math.round(BACKEND_CAP_BYTES * 0.9) },
    ],
    reason: "EP: below 80 %, from 80 % and from 90 % of the 768 MiB cap",
  },
  {
    title: "Host memory headroom",
    anchor: "host-memory",
    source: "Host memory available",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "red", value: 0 },
      { color: "green", value: 200 * 1024 * 1024 },
    ],
    reason: "EP: below and at or above the 200 MiB floor (#182)",
  },
  {
    title: "Host disk headroom",
    anchor: "host-disk",
    source: "Host disk free — Docker volumes",
    steps: [
      { color: NEUTRAL, value: null },
      { color: "red", value: 0 },
      { color: "orange", value: 0.1 },
      { color: "green", value: 0.2 },
    ],
    reason: "EP: below 10 %, below 20 % and at 20 % free or more (#182)",
  },
] satisfies {
  title: string
  anchor: string
  source: string
  steps: ThresholdStep[]
  reason: string
}[]

const sourceOf = (title: string, panels = requestPanels) => {
  const sources = panels.filter(
    (panel) => panel.title === title && !strip.includes(panel),
  )
  expect(sources.length).toBeGreaterThan(0)
  return sources[0]
}

describe("Requirements strip on the request dashboard (#184)", () => {
  it("opens the dashboard, above Traffic and Latency, one row of stats", () => {
    expect(stripRow).toBe(1)
    expect(topLevel[stripRow]).toMatchObject({ type: "row", collapsed: false })
    expect(topLevel[nextRow].title).toBe("Traffic and thresholds")
    expect(strip.length).toBe(requirements.length + 1)
    const { y } = topLevel[stripRow].gridPos
    for (const panel of strip) {
      expect(panel.type).toBe("stat")
      expect(panel.gridPos).toMatchObject({ y: y + 1, h: 3 })
    }
    expect(strip.reduce((width, { gridPos }) => width + gridPos.w, 0)).toBe(24)
  })

  describe.each(requirements)(
    "$title ($reason)",
    ({ title, source, steps }) => {
      it(`reuses the promtool-tested query of "${source}"`, () => {
        const [target] = findStat(title).targets!
        expect(findStat(title).targets).toHaveLength(1)
        expect(target.instant).toBe(true)
        expect(sourceOf(source).targets!.map(({ expr }) => expr)).toContain(
          target.expr,
        )
        expect(promtoolTests).toContain(promtoolCase(target.expr))
      })

      it("is coloured by its target and reads Unavailable in grey", () => {
        const { color, thresholds, noValue } =
          findStat(title).fieldConfig!.defaults
        expect(color).toEqual({ mode: "thresholds" })
        expect(thresholds!.steps).toEqual(steps)
        expect(noValue).toMatch(/^Unavailable/)
        expect(pickColor(thresholds!.steps, null)).toBe(NEUTRAL)
      })

      it("keeps the unit of the panel it reuses", () => {
        expect(findStat(title).fieldConfig!.defaults.unit).toBe(
          sourceOf(source).fieldConfig!.defaults.unit,
        )
      })
    },
  )

  const MIB = 1024 * 1024
  it.each([
    {
      title: "Browsing p95 within 2 s",
      value: 1.999,
      color: "green",
      reason: "BVA: just below 2 s",
    },
    {
      title: "Browsing p95 within 2 s",
      value: 2,
      color: "orange",
      reason: "BVA: at 2 s, the browsing target missed",
    },
    {
      title: "Browsing p95 within 2 s",
      value: 4.999,
      color: "orange",
      reason: "BVA: just below 5 s",
    },
    {
      title: "Browsing p95 within 2 s",
      value: 5,
      color: "red",
      reason: "BVA: at 5 s, beyond the submission target",
    },
    {
      title: "Order submission p95 within 5 s",
      value: 4.999,
      color: "green",
      reason: "BVA: just below 5 s",
    },
    {
      title: "Order submission p95 within 5 s",
      value: 5,
      color: "red",
      reason: "BVA: at 5 s",
    },
    {
      title: "Server failures (5xx)",
      value: 0,
      color: "green",
      reason: "BVA: no failure",
    },
    {
      title: "Server failures (5xx)",
      value: 0.000001,
      color: "orange",
      reason: "BVA: the smallest share counted",
    },
    {
      title: "Event-loop delay p99",
      value: 0.099,
      color: "green",
      reason: "BVA: just below 0.1 s",
    },
    {
      title: "Event-loop delay p99",
      value: 0.1,
      color: "orange",
      reason: "BVA: at 0.1 s",
    },
    {
      title: "Event-loop delay p99",
      value: 0.999,
      color: "orange",
      reason: "BVA: just below 1 s",
    },
    {
      title: "Event-loop delay p99",
      value: 1,
      color: "red",
      reason: "BVA: at 1 s",
    },
    {
      title: "Backend memory, 768 MiB cap",
      value: 644245093,
      color: "green",
      reason: "BVA: just below 80 % of the cap",
    },
    {
      title: "Backend memory, 768 MiB cap",
      value: 644245094,
      color: "orange",
      reason: "BVA: at 80 % of the cap",
    },
    {
      title: "Backend memory, 768 MiB cap",
      value: 724775730,
      color: "orange",
      reason: "BVA: just below 90 % of the cap",
    },
    {
      title: "Backend memory, 768 MiB cap",
      value: 724775731,
      color: "red",
      reason: "BVA: at 90 % of the cap",
    },
    {
      title: "Host memory headroom",
      value: 200 * MIB - 1,
      color: "red",
      reason: "BVA: just below the 200 MiB floor",
    },
    {
      title: "Host memory headroom",
      value: 200 * MIB,
      color: "green",
      reason: "BVA: at the floor",
    },
    {
      title: "Host disk headroom",
      value: 0.099,
      color: "red",
      reason: "BVA: just below 10 % free",
    },
    {
      title: "Host disk headroom",
      value: 0.1,
      color: "orange",
      reason: "BVA: at 10 % free",
    },
    {
      title: "Host disk headroom",
      value: 0.199,
      color: "orange",
      reason: "BVA: just below 20 % free",
    },
    {
      title: "Host disk headroom",
      value: 0.2,
      color: "green",
      reason: "BVA: at 20 % free",
    },
  ])("$title shows $value as $color ($reason)", ({ title, value, color }) => {
    const { steps } = findStat(title).fieldConfig!.defaults.thresholds!
    expect(pickColor(steps, value)).toBe(color)
  })

  it("shows the p95 of Order submission only, the cart-complete route", () => {
    const panel = findStat("Order submission p95 within 5 s")
    expect(panel.targets![0].legendFormat).toBe("{{method}} {{route}}")
    expect(panel.transformations).toEqual([
      {
        id: "filterFieldsByName",
        options: { include: { names: ["POST /store/carts/:id/complete"] } },
      },
    ])
    const route = readFileSync(
      join(__dirname, "../../api/store/carts/[id]/complete/route.ts"),
      "utf8",
    )
    expect(route).toMatch(/export (const|async function) POST\b/)
  })

  describe("the docs table it links to", () => {
    const PAGE =
      "https://dannyshayh.github.io/MTGO/quality/monitoring-requirements/"
    const docs = readFileSync(
      join(
        __dirname,
        "../../../../docs/src/content/docs/quality/monitoring-requirements.md",
      ),
      "utf8",
    )
    // A table row carries its anchor in the first cell.
    const tableRows = docs
      .split("\n")
      .filter((line) => /^\| <span id="[a-z0-9-]+"><\/span>/.test(line))
    const anchorOf = (row: string) => row.match(/id="([a-z0-9-]+)"/)![1]
    const linkedAnchors = strip.map(
      (panel) => panel.links?.[0]?.url.split("#")[1],
    )

    it.each(strip.map(({ title }) => title))(
      "%s links to its own row in the table",
      (title) => {
        const { links } = findStat(title)
        expect(links).toHaveLength(1)
        const [page, anchor] = links![0].url.split("#")
        expect(page).toBe(PAGE)
        expect(tableRows.map(anchorOf)).toContain(anchor)
      },
    )

    it.each([
      ...requirements.map(({ title, anchor }) => ({ title, anchor })),
      { title: "Event collection", anchor: "event-collection" },
    ])("$title links to the $anchor row", ({ title, anchor }) => {
      expect(findStat(title).links![0].url).toBe(`${PAGE}#${anchor}`)
    })

    it.each(tableRows.map((row) => ({ anchor: anchorOf(row), row })))(
      "row $anchor has a stat when measured, and says why when not",
      ({ anchor, row }) => {
        const measured = !row.includes("Not measured")
        expect(linkedAnchors.includes(anchor)).toBe(measured)
      },
    )

    it("gives every stat its own row", () => {
      expect(new Set(linkedAnchors).size).toBe(strip.length)
    })

    it.each(["availability", "concurrent-journeys"])(
      "records %s as not measured, with the reason",
      (anchor) => {
        const row = tableRows.find((line) => anchorOf(line) === anchor)
        expect(row).toContain("Not measured")
      },
    )
  })

  describe("Event collection health (#179)", () => {
    const title = "Event collection"
    const source = sourceOf("Collection state — rolling 5 minutes", eventPanels)

    it("reuses the events dashboard's promtool-tested collection state", () => {
      const [target] = findStat(title).targets!
      expect(target.expr).toBe(source.targets![0].expr)
      expect(promtoolTests).toContain(promtoolCase(target.expr))
    })

    it("keeps its states and colours, and reads Unavailable in grey", () => {
      const { color, mappings, noValue } = findStat(title).fieldConfig!.defaults
      expect(mappings).toEqual(source.fieldConfig!.defaults.mappings)
      expect(color).toEqual({ mode: "fixed", fixedColor: NEUTRAL })
      expect(noValue).toMatch(/^Unavailable/)
    })
  })
})
