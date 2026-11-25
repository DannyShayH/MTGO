import { readFileSync } from "node:fs"
import { join } from "node:path"

// Retained and resumed log history (#178), checked at the configuration the
// stacks run with. The behavior itself is exercised on real containers by
// deploy/monitoring/tests/log-history (see approved-application-events.md).
const root = join(__dirname, "../../../../..")
const monitoring = join(root, "deploy/monitoring")
const read = (path: string) => readFileSync(join(monitoring, path), "utf8")

const collector = read("alloy/config.alloy")
const pipeline = read("alloy/approved-events.alloy")
const loki = read("loki/config.yaml")

/** One service's block of a Compose file. */
function composeService(compose: string, service: string) {
  const block = compose.match(
    new RegExp(`^ {2}${service}:\\n((?:(?: {4}.*)?\\n)+)`, "m"),
  )
  if (!block) throw new Error(`No service ${service}`)
  return block[1]
}

const setting = (key: string) =>
  loki.match(new RegExp(`^ {2}${key}: (\\S+)`, "m"))?.[1]

const stacks = [
  "compose.yaml",
  "compose.staging.yaml",
  "tests/log-history/compose.yaml",
]

describe("the seven-day window", () => {
  it.each(["retention_period", "reject_old_samples_max_age"])(
    "Loki's %s is seven days",
    (key) => {
      expect(setting(key)).toBe("168h")
    },
  )

  // Loki deletes whole chunks, later. Queries must not show older records.
  it("a query never shows a record older than seven days", () => {
    expect(setting("max_query_lookback")).toBe("168h")
  })

  // A long query is split by the hour. With Loki's default, the parts over
  // three hours old skip the records that are not yet written to disk.
  it("a query finds imported history that is not yet written to disk", () => {
    expect(setting("query_ingesters_within")).toBe("0s")
  })

  it("older source records are dropped by their own time, before Loki", () => {
    const drop = pipeline.match(
      /stage\.drop \{\s*older_than\s*=\s*"168h"\s*drop_counter_reason = "older_than_seven_days"/,
    )
    expect(drop?.index).toBeGreaterThan(pipeline.indexOf("stage.timestamp {"))
  })
})

describe("retention processing", () => {
  it("is enabled, with the Compactor's state beside the chunks", () => {
    expect(setting("retention_enabled")).toBe("true")
    expect(setting("delete_request_store")).toBe("filesystem")
    expect(setting("path_prefix")).toBe("/loki")
    expect(setting("working_directory")).toBe("/loki/compactor")
  })
})

describe("resume after recreation", () => {
  // The position of a container is stored under its whole label set. Docker's
  // own labels can change on a restart (its network address, for example).
  it("a container's identity is its ID and its service only", () => {
    expect(collector).toMatch(
      /action = "labelkeep"\s*regex\s*=\s*"__meta_docker_container_id\|source_service"/,
    )
    expect(collector.lastIndexOf('"labelkeep"')).toBeGreaterThan(
      collector.lastIndexOf('"replace"'),
    )
  })

  // The component's name is its folder in the storage path.
  it("the collector keeps the name its positions are stored under", () => {
    expect(collector).toContain('loki.source.docker "application" {')
  })

  it.each(stacks)("%s keeps positions and Loki's state in volumes", (file) => {
    const compose = read(file)
    const alloyService = composeService(compose, "alloy")
    expect(alloyService).toContain("--storage.path=/var/lib/alloy/data")
    expect(alloyService).toContain("- alloy-data:/var/lib/alloy/data")
    expect(composeService(compose, "loki")).toContain("- loki-data:/loki")
    expect(compose).toMatch(/^volumes:\n(?: {2}.*\n)*? {2}loki-data:/m)
    expect(compose).toMatch(/^volumes:\n(?: {2}.*\n)*? {2}alloy-data:/m)
  })
})

describe("Docker's own rotation", () => {
  const rotation = /max-size: "10m"\s*max-file: "5"/

  it("is the same in the demo application as on staging", () => {
    expect(
      readFileSync(join(root, "deploy/staging/compose.yaml"), "utf8"),
    ).toMatch(rotation)
    const demo = read("compose.application.yaml")
    expect(demo).toMatch(rotation)
    for (const service of ["backend", "partner"])
      expect(composeService(demo, service)).toContain("logging: *logging")
  })
})
