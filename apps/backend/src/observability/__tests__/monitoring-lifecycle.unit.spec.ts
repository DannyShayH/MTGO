import { readFileSync } from "node:fs"
import { join } from "node:path"

// Guards the configuration that lets monitoring outlive application releases
// and rollback (#180). It does not show the journey works: deploy, rollback to
// an uninstrumented release and monitoring recreation are the rehearsal in
// local-request-monitoring.md.
const root = join(__dirname, "../../../../..")
const readRepoFile = (path: string) => readFileSync(join(root, path), "utf8")

const monitoringStacks = {
  "deploy/monitoring/compose.yaml": "mtogo-monitoring",
  "deploy/monitoring/compose.staging.yaml": "mtogo-staging-monitoring",
}

const applicationReleases = {
  "deploy/staging/compose.yaml": "mtogo-staging",
  "deploy/monitoring/compose.application.yaml": "mtogo-monitoring-demo",
}
const statefulServices = ["prometheus", "grafana", "loki", "alloy"]
const monitoringServices = [...statefulServices, "node-exporter"]
const stateVolumes = statefulServices.map((service) => `${service}-data`)
// Node Exporter reads the disk these are on, and no host folder (#182).
const diskProbes = ["/etc/hostname", "node-exporter-disk"]

const findProjectName = (compose: string) =>
  compose.match(/^name: (\S+)$/m)?.[1]
/** Top-level service names of a Compose file. */
const listServiceNames = (compose: string) => {
  const services = compose.match(/^services:\n((?:(?: {2}.*)?\n)+)/m)?.[1]
  return [...(services ?? "").matchAll(/^ {2}([a-z-]+):$/gm)].map(
    ([, name]) => name,
  )
}
/** The bind-mount sources of a Compose file's volume entries. */
const listMountSources = (compose: string) =>
  [...compose.matchAll(/^ {6}- ([^:\s]+):\//gm)].map(([, source]) => source)

describe("separate lifecycles", () => {
  // Orphan removal works per project: a release never removes, and a rollback
  // never omits, a service of another project.
  it("application releases and monitoring are different Compose projects", () => {
    const names = [
      ...Object.keys(applicationReleases),
      ...Object.keys(monitoringStacks),
    ].map((file) => findProjectName(readRepoFile(file)))
    expect(names).toEqual([
      ...Object.values(applicationReleases),
      ...Object.values(monitoringStacks),
    ])
  })

  it.each(Object.keys(applicationReleases))(
    "%s defines no monitoring service",
    (file) => {
      const services = listServiceNames(readRepoFile(file))
      expect(services).toContain("backend")
      for (const service of monitoringServices)
        expect(services).not.toContain(service)
    },
  )

  // The configuration is installed once into the stack's own folder, never
  // mounted from a release folder that pruning or rollback replaces.
  it.each(Object.keys(monitoringStacks))(
    "%s mounts only its own files, its volumes, the disk probes and the Docker socket",
    (file) => {
      const compose = readRepoFile(file)
      const sources = listMountSources(compose)
      expect(sources.length).toBeGreaterThan(5)
      // Each once: no other service mounts them.
      expect(sources.filter((source) => diskProbes.includes(source))).toEqual(
        diskProbes,
      )
      // No `..`: every segment starts with a letter.
      for (const source of sources)
        expect(
          /^\.(?:\/[a-z][a-z.-]*)+$/.test(source) ||
            stateVolumes.includes(source) ||
            diskProbes.includes(source) ||
            source === "/var/run/docker.sock",
        ).toBe(true)
      // The long syntax would escape the check above.
      expect(compose).not.toMatch(/^\s+source:/m)
    },
  )
})

describe("private application attachment", () => {
  // Compose recreates a network whose definition changed, and Docker refuses
  // while monitoring is attached: every release must define it the same way.
  it("the staging application defines the scrape network exactly as released since #194", () => {
    expect(readRepoFile("deploy/staging/compose.yaml")).toMatch(
      /^ {2}metrics:\n {4}internal: true\n {4}name: mtogo-staging-metrics\n(?:\n|$)/m,
    )
  })

  it.each([
    ["deploy/monitoring/compose.staging.yaml", "mtogo-staging-metrics"],
    ["deploy/monitoring/compose.yaml", "mtogo-local-metrics"],
  ])("%s only joins %s, which it never creates or removes", (file, name) => {
    expect(readRepoFile(file)).toMatch(
      new RegExp(
        `^ {2}metrics:\\n {4}external: true\\n {4}name: ${name}$`,
        "m",
      ),
    )
  })
  // The rehearsal's stand-in for a release from before #194: the rolled-back
  // backend must leave the scrape network, not only switch its exporter off.
  it("the uninstrumented override takes the backend off the scrape network", () => {
    expect(
      readRepoFile("deploy/monitoring/compose.uninstrumented.yaml"),
    ).toMatch(
      /^ {4}environment:\n {6}MTOGO_METRICS_ENABLED: "0"\n {4}networks: !override\n {6}application:\n {6}loopback:\n?$/m,
    )
  })
})

describe("monitoring state", () => {
  it.each(Object.entries(monitoringStacks))(
    "%s keeps each store in a volume of its own project",
    (file, project) => {
      const compose = readRepoFile(file)
      for (const volume of stateVolumes)
        expect(compose).toMatch(
          new RegExp(`^ {2}${volume}:\\n {4}name: ${project}_${volume}$`, "m"),
        )
    },
  )
})
