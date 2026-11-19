import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { backendJest, coverageSettings } from "./backend-changes.mjs"

// The ready flow's backend coverage gate over a sharded run.
//
// Each shard runs part of the unit and HTTP specs with `jest --shard` and
// writes Istanbul's coverage-final.json without a threshold. This merges the
// shards' hit counts as Jest merges its workers' results, then applies the
// global thresholds from jest.config.js to the whole suite, exactly as a single
// whole-suite `npm run test:coverage` would. It writes coverage/lcov.info for
// Sonar and prints Jest's text summary.
//
// Run from apps/backend: `node ../../scripts/merge-coverage.mjs --shards=<n> <dir>...`,
// where each directory holds one shard's coverage-final.json (searched
// recursively). Exits 1 when a threshold is not met or a shard is missing.

const backend = fileURLToPath(new URL("../apps/backend/", import.meta.url))
const { fromReporters } = backendJest(backend)
const { createCoverageMap } = fromReporters("istanbul-lib-coverage")

/**
 * The merged coverage of the shards' coverage-final.json reports, its
 * summary and the thresholds it misses, worded as Jest words them.
 */
export function coverageGate(reports, thresholds) {
  // Jest maps a file no test of a shard loaded straight from its source, but
  // source-maps a file a test executed, so the two maps of one file can
  // differ, and Istanbul would merge them as a union of statements. Such an
  // unloaded file has no hits to add, so it only counts while no shard
  // executed the file, as in a single whole-suite run.
  const executed = new Set()
  for (const report of reports)
    for (const [file, coverage] of Object.entries(report))
      if (wasExecuted(coverage)) executed.add(file)
  const map = createCoverageMap({})
  for (const report of reports)
    map.merge(
      Object.fromEntries(
        Object.entries(report).filter(
          ([file, coverage]) => wasExecuted(coverage) || !executed.has(file),
        ),
      ),
    )
  const summary = map.getCoverageSummary().toJSON()
  const failures = ["statements", "branches", "lines", "functions"]
    .filter((key) => thresholds[key] !== undefined)
    .filter((key) => summary[key].pct < thresholds[key])
    .map(
      (key) =>
        `Jest: "global" coverage threshold for ${key} (${thresholds[key]}%) not met: ${summary[key].pct}%`,
    )
  return { map, summary, failures }
}

/** Whether a shard's coverage of a file counted any hit at all. */
const wasExecuted = ({ s, f, b }) =>
  Object.values(s).some((hits) => hits > 0) ||
  Object.values(f).some((hits) => hits > 0) ||
  Object.values(b).some((hits) => hits.some((hit) => hit > 0))

/** Every coverage-final.json below a directory. */
async function reportsUnder(dir) {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch((error) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  return entries
    .filter((entry) => entry.isFile() && entry.name === "coverage-final.json")
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const shardsArg = process.argv.find((arg) => arg.startsWith("--shards="))
  const expectedShards = shardsArg ? Number(shardsArg.slice(9)) : undefined
  const dirs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
  const files = (await Promise.all(dirs.map(reportsUnder))).flat().sort()
  if (!files.length) {
    console.error(`No coverage-final.json under ${dirs.join(", ") || "(none)"}`)
    process.exit(1)
  }
  // A missing shard would leave its specs' coverage out of the gate.
  if (expectedShards !== undefined && files.length !== expectedShards) {
    console.error(
      `Expected ${expectedShards} coverage shards, found ${files.length}:\n  ${files.join("\n  ")}`,
    )
    process.exit(1)
  }
  console.log(
    `Merging ${files.length} coverage reports:\n  ${files.join("\n  ")}`,
  )
  const reports = await Promise.all(
    files.map(async (file) => JSON.parse(await readFile(file, "utf8"))),
  )
  const { thresholds } = coverageSettings(backend)
  const { map, failures } = coverageGate(reports, thresholds)
  const libReport = fromReporters("istanbul-lib-report")
  const reporters = fromReporters("istanbul-reports")
  const context = libReport.createContext({
    dir: resolve(backend, "coverage"),
    coverageMap: map,
  })
  for (const name of ["text-summary", "lcov"])
    reporters.create(name).execute(context)
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exit(1)
  }
}
