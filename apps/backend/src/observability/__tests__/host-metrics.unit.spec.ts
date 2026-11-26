import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readComposeService } from "./compose-service"
import {
  NEUTRAL,
  pickColor,
  readRequestDashboard,
  type Panel,
} from "./dashboard"

// Host CPU, load, memory, swap and disk from Node Exporter (#182), checked at the
// configuration the stacks run with. What the queries answer is the promtool
// file's oracle; running containers are the runbook's rehearsal.
const monitoring = join(__dirname, "../../../../../deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

const stacks = ["compose.yaml", "compose.staging.yaml"]
const MIB = 1024 * 1024

describe("Node Exporter container", () => {
  it.each([
    ...stacks.map((file) => [file, "node-exporter"]),
    ["tests/disk-check/compose.yaml", "disk-filler"],
  ])("%s pins the same image for %s", (file, service) => {
    expect(readComposeService(read(file), service)).toContain(
      "image: prom/node-exporter:v1.13.1\n",
    )
  })

  it.each(stacks)("%s publishes no port and runs unprivileged", (file) => {
    const service = readComposeService(read(file), "node-exporter")
    expect(service).not.toMatch(/ports:|privileged|user:|pid:|network_mode/)
    expect(service).toMatch(/cap_drop:\n {6}- ALL\n/)
    expect(service).toContain("no-new-privileges:true")
    expect(service).toContain("read_only: true")
  })

  // Only Prometheus shares a network with it, and that network has no route out.
  it.each(stacks)("%s lets only Prometheus reach it", (file) => {
    const compose = read(file)
    expect(readComposeService(compose, "node-exporter")).toMatch(
      /networks:\n {6}- host-metrics\n(?! {6}- )/,
    )
    expect(compose).toMatch(/^ {2}host-metrics:\n {4}internal: true$/m)
    expect(compose.match(/^ {6}- host-metrics$/gm)).toHaveLength(2)
    expect(readComposeService(compose, "prometheus")).toContain(
      "- host-metrics",
    )
  })

  // A file on the root file system and an empty volume are enough to read the
  // free space of the disks they are on; no host folder is exposed.
  it.each(stacks)("%s mounts read-only, and no host folder", (file) => {
    const service = readComposeService(read(file), "node-exporter")
    const mounts = service.match(/volumes:\n((?: {6}.*\n)+)/)![1]
    expect(mounts.match(/^ {6}- (.*)$/gm)!.map((line) => line.trim())).toEqual([
      "- /etc/hostname:/host/root:ro",
      "- node-exporter-disk:/host/docker-volumes:ro",
    ])
  })

  it.each(stacks)(
    "%s collects only CPU, load, memory and those two disks",
    (file) => {
      const service = readComposeService(read(file), "node-exporter")
      const collectors = [...service.matchAll(/--collector\.([a-z]+)$/gm)].map(
        ([, name]) => name,
      )
      expect(service).toContain("--collector.disable-defaults")
      expect(collectors.sort()).toEqual([
        "cpu",
        "filesystem",
        "loadavg",
        "meminfo",
      ])
      expect(service).toContain(
        "--collector.filesystem.mount-points-include=^/host/(root|docker-volumes)$$",
      )
      expect(service).toContain("--web.disable-exporter-metrics")
    },
  )

  it.each(stacks)("%s caps its memory without extra swap", (file) => {
    const service = readComposeService(read(file), "node-exporter")
    expect(service).toContain("GOMEMLIMIT: 32MiB")
    expect(service).toContain("memswap_limit: 48m")
    expect(service).toMatch(/limits:\n {10}memory: 48m\n/)
  })
})

describe("disk check on a disposable volume", () => {
  const check = read("tests/disk-check/compose.yaml")

  it("replaces only the disk that the Docker volumes panel reads", () => {
    expect(readComposeService(check, "node-exporter")).toBe(
      "    volumes:\n      - disk-check:/host/docker-volumes:ro\n\n",
    )
  })

  it("is limited in size and never starts with the stack", () => {
    expect(check).toMatch(/type: tmpfs\n.*\n {6}o: size=64m,/)
    expect(readComposeService(check, "disk-filler")).toContain(
      'profiles: ["disk-check"]',
    )
    for (const file of stacks) expect(read(file)).not.toContain("disk-check")
  })
})

describe("host scrape", () => {
  const prometheus = read("prometheus.yaml")
  const job = prometheus.split("- job_name: ").find((text) => {
    return text.startsWith("mtogo-node\n")
  })

  it("scrapes Node Exporter every 15 seconds", () => {
    expect(prometheus).toMatch(/^ {2}scrape_interval: 15s$/m)
    expect(job).toContain("targets: [node-exporter:9100]")
    expect(job).not.toContain("scrape_interval")
  })

  it("stores only the series the Host row uses", () => {
    expect(job).toContain("action: keep")
    const kept = job!.match(/regex: (\S+)/)![1].split("|")
    const used = listHostPanels()
      .flatMap(({ targets }) => targets ?? [])
      .flatMap(({ expr }) => expr.match(/\bnode_\w+/g) ?? [])
    expect(new Set(kept)).toEqual(new Set(used))
  })
})

const dashboard = readRequestDashboard()

/** The panels between the Host row and the next row. */
function listHostPanels() {
  const topLevel = dashboard.panels
  const start = topLevel.findIndex(
    ({ type, title }) => type === "row" && title === "Host",
  )
  if (start < 0) throw new Error("No Host row")
  const next = topLevel.findIndex(
    ({ type }, index) => index > start && type === "row",
  )
  return topLevel.slice(start + 1, next)
}

describe("Host row", () => {
  const findPanel = (title: string, type: string) =>
    listHostPanels().find(
      (panel) => panel.title === title && panel.type === type,
    )!
  const readDefaults = (title: string, type: string) =>
    findPanel(title, type).fieldConfig!.defaults

  it("shows CPU, load, memory, swap and both disks, now and over time", () => {
    expect(listHostPanels().map(({ type, title }) => [type, title])).toEqual([
      ["stat", "Host CPU used — rolling 5 minutes"],
      ["stat", "Host load per core — 5 minutes"],
      ["stat", "Host memory available"],
      ["stat", "Host memory available — lowest in the displayed range"],
      ["stat", "Host swap used"],
      ["stat", "Host swap used — most in the displayed range"],
      ["stat", "Host disk free — root file system"],
      ["stat", "Host disk free — Docker volumes"],
      ["timeseries", "Host memory available"],
      ["timeseries", "Host swap used"],
      ["timeseries", "Host disk free"],
      ["timeseries", "Host CPU used — rolling 5 minutes"],
      ["timeseries", "Host load average and cores"],
    ])
  })

  it("fills the full width without overlapping", () => {
    const lines = new Map<number, Panel[]>()
    for (const panel of listHostPanels())
      lines.set(panel.gridPos.y, [...(lines.get(panel.gridPos.y) ?? []), panel])
    let expectedY = listHostPanels()[0].gridPos.y
    for (const [y, line] of lines) {
      expect(y).toBe(expectedY)
      let x = 0
      for (const { gridPos } of line) {
        expect(gridPos.x).toBe(x)
        expect(gridPos.h).toBe(line[0].gridPos.h)
        x += gridPos.w
      }
      expect(x).toBe(24)
      expectedY += line[0].gridPos.h
    }
  })

  // `free -m` counts MiB, so the 200 MB floor is 200 MiB.
  const FLOOR = 200 * MIB
  // The smallest step of a share; Grafana compares the unrounded value.
  const SHARE_STEP = 0.000001
  const diskTitles = [
    "Host disk free — root file system",
    "Host disk free — Docker volumes",
  ]

  it.each([
    ...[
      ["Host memory available", "no current value"],
      [
        "Host memory available — lowest in the displayed range",
        "no scrape in the range",
      ],
    ].flatMap(([title, missing]) => [
      { title, value: null, color: NEUTRAL, reason: `EP invalid: ${missing}` },
      { title, value: 0, color: "red", reason: "BVA: the minimum" },
      {
        title,
        value: FLOOR - 1,
        color: "red",
        reason: "BVA: one byte below the 200 MB floor",
      },
      {
        title,
        value: FLOOR,
        color: "green",
        reason: "BVA: on the 200 MB floor",
      },
      {
        title,
        value: FLOOR + 1,
        color: "green",
        reason: "BVA: one byte above the 200 MB floor",
      },
    ]),
    ...diskTitles.flatMap((title) => [
      {
        title,
        value: null,
        color: NEUTRAL,
        reason: "EP invalid: no current value",
      },
      {
        title,
        value: 0,
        color: "red",
        reason: "BVA: the minimum, a full disk",
      },
      {
        title,
        value: 0.1 - SHARE_STEP,
        color: "red",
        reason: "BVA: just below 10 %",
      },
      { title, value: 0.1, color: "orange", reason: "BVA: on 10 %" },
      {
        title,
        value: 0.1 + SHARE_STEP,
        color: "orange",
        reason: "BVA: just above 10 %",
      },
      {
        title,
        value: 0.2 - SHARE_STEP,
        color: "orange",
        reason: "BVA: just below 20 %",
      },
      { title, value: 0.2, color: "green", reason: "BVA: on 20 %" },
      {
        title,
        value: 0.2 + SHARE_STEP,
        color: "green",
        reason: "BVA: just above 20 %",
      },
      {
        title,
        value: 1,
        color: "green",
        reason: "BVA: the maximum, an empty disk",
      },
    ]),
  ])("colours $title $color at $value ($reason)", ({ title, value, color }) => {
    const defaults = readDefaults(title, "stat")
    expect(defaults.color).toEqual({ mode: "thresholds" })
    expect(pickColor(defaults.thresholds!.steps, value)).toBe(color)
  })

  it.each([
    {
      title: "Host memory available",
      unit: "bytes",
      reason: "EP: an amount of memory",
    },
    {
      title: "Host memory available — lowest in the displayed range",
      unit: "bytes",
      reason: "EP: an amount of memory",
    },
    ...diskTitles.map((title) => ({
      title,
      unit: "percentunit",
      reason: "EP: a share of a disk",
    })),
  ])("shows $title in its unit ($reason)", ({ title, unit }) => {
    expect(readDefaults(title, "stat").unit).toBe(unit)
  })

  it.each([
    {
      title: "Host swap used",
      unit: "bytes",
      reason: "EP: an amount of memory without an agreed limit",
    },
    {
      title: "Host swap used — most in the displayed range",
      unit: "bytes",
      reason: "EP: an amount of memory without an agreed limit",
    },
    {
      title: "Host CPU used — rolling 5 minutes",
      unit: "percentunit",
      reason: "EP: a share of time without an agreed limit",
    },
    {
      title: "Host load per core — 5 minutes",
      unit: "short",
      reason: "EP: a ratio without an agreed limit",
    },
  ])(
    "shows $title in neutral, because no limit is agreed ($reason)",
    ({ title, unit }) => {
      const defaults = readDefaults(title, "stat")
      expect(defaults.unit).toBe(unit)
      expect(defaults.color).toEqual({ mode: "fixed", fixedColor: NEUTRAL })
    },
  )

  it("reads Unavailable when there is no current value", () => {
    for (const { fieldConfig } of listHostPanels())
      expect(fieldConfig!.defaults.noValue).toBe("Unavailable")
  })

  it("breaks the lines of the charts where evidence is missing", () => {
    for (const { type, fieldConfig } of listHostPanels())
      if (type === "timeseries")
        expect(fieldConfig!.defaults.custom!.spanNulls).toBe(false)
  })

  it.each([
    {
      title: "Host memory available",
      unit: "bytes",
      lines: [["red", FLOOR]],
      reason: "BVA: one limit, the agreed 200 MB floor",
    },
    {
      title: "Host disk free",
      unit: "percentunit",
      lines: [
        ["red", 0.1],
        ["orange", 0.2],
      ],
      reason: "BVA: two limits, amber below 20 % and red below 10 %",
    },
  ])(
    "draws the limits on the $title chart ($reason)",
    ({ title, unit, lines }) => {
      const defaults = readDefaults(title, "timeseries")
      expect(defaults.unit).toBe(unit)
      expect(defaults.custom!.thresholdsStyle).toEqual({ mode: "dashed" })
      expect(defaults.thresholds!.steps).toEqual([
        { color: "transparent", value: null },
        ...lines.map(([color, value]) => ({ color, value })),
      ])
    },
  )

  // Auto-scaled, a full disk and an empty one look alike.
  it.each(["Host disk free", "Host CPU used — rolling 5 minutes"])(
    "draws %s on a fixed 0–100% axis",
    (title) => {
      expect(readDefaults(title, "timeseries")).toMatchObject({
        unit: "percentunit",
        min: 0,
        max: 1,
      })
    },
  )

  // Waiting for the disk is not CPU work; time taken by the hypervisor is lost.
  it("counts all CPU time but idle and waiting for input or output", () => {
    for (const type of ["stat", "timeseries"]) {
      const { targets } = findPanel("Host CPU used — rolling 5 minutes", type)
      expect(targets).toHaveLength(1)
      expect(targets![0].expr).toContain('mode!~"idle|iowait"')
    }
  })

  it("draws the load averages next to the number of cores", () => {
    const { targets } = findPanel("Host load average and cores", "timeseries")
    expect(targets!.map(({ legendFormat }) => legendFormat)).toEqual([
      "1 minute",
      "5 minutes",
      "15 minutes",
      "cores",
    ])
  })

  it("keeps a missing disk apart from the other one", () => {
    const listExprs = (title: string) =>
      listHostPanels()
        .filter((panel) => panel.title === title)
        .flatMap(({ targets }) => targets!.map(({ expr }) => expr))
    expect(listExprs("Host disk free")).toEqual([
      ...listExprs("Host disk free — root file system"),
      ...listExprs("Host disk free — Docker volumes"),
    ])
    expect(listExprs("Host disk free — root file system")[0]).toContain(
      'mountpoint="/host/root"',
    )
    expect(listExprs("Host disk free — Docker volumes")[0]).toContain(
      'mountpoint="/host/docker-volumes"',
    )
  })

  const GATE = ' and on(job, instance) (up{job="mtogo-node"} == 1)'
  const RANGE_TITLES = [
    "Host memory available — lowest in the displayed range",
    "Host swap used — most in the displayed range",
  ]
  const listExprs = (inRange: boolean) =>
    listHostPanels()
      .filter(({ title }) => RANGE_TITLES.includes(title) === inRange)
      .flatMap(({ targets }) => targets!.map(({ expr }) => expr))

  it("only shows a currently scraped host", () => {
    const exprs = listExprs(false)
    expect(exprs).toHaveLength(16)
    for (const expr of exprs) expect(expr.slice(-GATE.length)).toBe(GATE)
  })

  // The gate sits inside the range, so a scrape while Node Exporter was down,
  // or a stale value still within the lookback, never counts.
  it("counts only scraped moments in the displayed range", () => {
    const exprs = listExprs(true)
    expect(exprs).toEqual([
      `min_over_time((${findPanel("Host memory available", "stat").targets![0].expr})[$__range:15s])`,
      `max_over_time((${findPanel("Host swap used", "stat").targets![0].expr})[$__range:15s])`,
    ])
    for (const expr of exprs) expect(expr).toContain(`${GATE})[$__range:15s]`)
  })

  it("says in the dashboard which host it is", () => {
    const text = dashboard.panels
      .flatMap((panel) => [panel, ...(panel.panels ?? [])])
      .find(({ title }) => title === "Host scope")!.options!.content!
    for (const claim of [
      "share of all cores",
      "`node-exporter:9100`",
      "virtual machine",
      "not per container",
      "200 MB",
      "same disk",
    ])
      expect(text).toContain(claim)
  })
})
