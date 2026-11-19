import { spawnSync } from "node:child_process"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import {
  backendJest,
  changeBase,
  changedBackendFiles,
  coverageSettings,
  literalGlob,
  measuredFiles,
} from "./backend-changes.mjs"
import { changedCoverageReport } from "./coverage-report.mjs"
import { resolveImport, selectHttpSpecs } from "./http-spec-selection.mjs"

// Runs the backend specs affected by changes since JEST_CHANGED_SINCE
// (default origin/main), including uncommitted and untracked files. Run it
// from apps/backend through `npm run test:affected`.
//
// Jest selects specs by following their imports. HTTP specs reach routes,
// middleware, links and Medusa configuration over HTTP instead of importing
// them, so http-spec-selection.mjs adds the specs that request the URL paths
// of changed files under src/api. Middleware, links, Medusa configuration and
// the helpers middleware applies to every request still run the whole HTTP
// suite. The run prints which specs were chosen and why.
//
// `--coverage` also measures the changed source files in the unit and HTTP
// runs, the suites the ready flow's coverage gate counts, and prints their
// branch coverage. The global threshold only applies to the full suite.
//
// Commands run by absolute path, never through a PATH lookup: Jest's own
// binary on the current Node executable, and Jest's changed-files library
// instead of spawning git, so "changed" means exactly what --changedSince uses.
const backend = process.cwd()
const { jestBin } = backendJest(backend)
const base = changeBase()
const changedFiles = await changedBackendFiles(backend, base)

/** Text of every source file under a folder, by backend-relative path. */
async function sourcesUnder(folder) {
  const entries = await readdir(join(backend, folder), {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries
    .filter((entry) => entry.isFile() && /\.[jt]s$/.test(entry.name))
    .map((entry) =>
      relative(backend, join(entry.parentPath ?? entry.path, entry.name)),
    )
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        await readFile(join(backend, file), "utf8"),
      ]),
    ),
  )
}

/** A spec's text plus that of the integration-tests helpers it imports. */
function specSources(spec, tests) {
  const seen = new Set()
  const queue = [spec]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    for (const [, specifier] of tests[file].matchAll(
      /from\s*["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      const base = relative(backend, resolve(backend, dirname(file), specifier))
      const target = resolveImport(base, tests)
      if (target) queue.push(target)
    }
  }
  return [...seen].map((file) => tests[file])
}

const tests = await sourcesUnder("integration-tests")
const httpSelection = selectHttpSpecs({
  changed: changedFiles,
  api: await sourcesUnder("src/api"),
  specs: Object.fromEntries(
    Object.keys(tests)
      .filter((file) => /^integration-tests\/http\/.*\.spec\.[jt]s$/.test(file))
      .map((spec) => [spec, specSources(spec, tests)]),
  ),
})
const isWholeHttpSuite = httpSelection.all !== null

const node = "--experimental-vm-modules"
const since = [`--changedSince=${base}`, "--passWithNoTests"]
const workers = `--maxWorkers=${process.env.JEST_MAX_WORKERS || "1"}`
const suites = [
  ["unit", ["--silent", ...since]],
  ["integration:modules", ["--silent", "--runInBand", "--forceExit", ...since]],
  [
    "integration:http",
    isWholeHttpSuite
      ? ["--silent=false", workers, "--forceExit"]
      : ["--silent=false", workers, "--forceExit", ...since],
  ],
]

if (isWholeHttpSuite)
  console.log(`Running every HTTP spec: ${httpSelection.all}`)
else if (httpSelection.specs.length)
  console.log(
    [
      "HTTP specs requesting the changed routes:",
      ...httpSelection.specs.map(
        ({ spec, reasons }) =>
          `  ${spec}\n${reasons.map((reason) => `    ${reason}`).join("\n")}`,
      ),
    ].join("\n"),
  )
// Extra arguments go to every Jest run, e.g. `-- --listTests` for a dry run.
const extra = process.argv.slice(2).filter((arg) => arg !== "--coverage")
const isCoverageRequested =
  process.argv.includes("--coverage") && !extra.includes("--listTests")
const coverageRoot = isCoverageRequested
  ? await mkdtemp(join(tmpdir(), "test-affected-coverage-"))
  : undefined
let coverageRuns = 0
// Coverage arguments for one Jest run of a suite the ready gate counts. Only
// the changed files the gate measures are instrumented.
const measured = isCoverageRequested ? measuredFiles(backend, changedFiles) : []
const coverageArgs = (type) =>
  measured.length > 0 && type !== "integration:modules"
    ? [
        "--coverage",
        `--collectCoverageFrom=${JSON.stringify(measured.map(literalGlob))}`,
        "--coverageReporters=lcov",
        `--coverageDirectory=${join(coverageRoot, String(coverageRuns++))}`,
        "--coverageThreshold={}",
      ]
    : []
/** Removes the per-run coverage reports, on success and on every early exit. */
const removeCoverageRoot = async () => {
  if (coverageRoot) await rm(coverageRoot, { recursive: true, force: true })
}
const jest = (type, args, options = { stdio: "inherit" }) =>
  spawnSync(process.execPath, [jestBin, ...args, ...extra], {
    ...options,
    env: { ...process.env, TEST_TYPE: type, NODE_OPTIONS: node },
  })

/** Prints the branch coverage of the changed files over every measured run. */
async function reportCoverage() {
  if (!isCoverageRequested) return
  const reports = []
  for (let run = 0; run < coverageRuns; run++)
    reports.push(
      // A spec that crashed before Jest wrote its report measured nothing.
      await readFile(
        join(coverageRoot, String(run), "lcov.info"),
        "utf8",
      ).catch((error) => {
        if (error.code === "ENOENT") return ""
        throw error
      }),
    )
  await removeCoverageRoot()
  const { branchThreshold } = coverageSettings(backend)
  console.log(changedCoverageReport(reports, measured, branchThreshold))
}

for (const [type, args] of suites) {
  if (type !== "integration:http") {
    const result = jest(type, [...args, ...coverageArgs(type)])
    if (result.status !== 0) {
      await removeCoverageRoot()
      process.exit(result.status ?? 1)
    }
    continue
  }
  // With one worker Jest runs every HTTP spec in a single process, whose heap
  // grows with each booted Medusa app until Node runs out of memory. A fresh
  // Jest process per spec releases that memory between specs.
  const listed = jest(type, [...args, "--listTests", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
  if (listed.status !== 0) {
    await removeCoverageRoot()
    process.exit(listed.status ?? 1)
  }
  // Jest's import-based picks plus the specs requesting the changed routes.
  const specs = [
    ...new Set([
      ...JSON.parse(listed.stdout),
      ...httpSelection.specs.map(({ spec }) => join(backend, spec)),
    ]),
  ].sort()
  if (extra.includes("--listTests")) {
    console.log(specs.join("\n"))
    continue
  }
  const failed = specs.filter(
    (spec) =>
      jest(type, [...args, "--runTestsByPath", spec, ...coverageArgs(type)])
        .status !== 0,
  )
  await reportCoverage()
  if (failed.length > 0) {
    console.error(
      `Failed HTTP specs:\n${failed.map((spec) => `  ${relative(backend, spec)}`).join("\n")}`,
    )
    process.exit(1)
  }
}
