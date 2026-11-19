import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import {
  changeBase,
  changedBackendFiles,
  coverageSettings,
} from "./backend-changes.mjs"

// Branch coverage of the backend files a change touches, read from LCOV.
//
// Run from apps/backend as `node ../../scripts/coverage-report.mjs [lcov...]`
// (default coverage/lcov.info). The ready flow runs it when the coverage
// threshold fails; `npm run test:affected -- --coverage` uses it for the
// reports of the affected specs.

/**
 * Taken count of each branch (line,block,branch) per source file, summed over
 * LCOV reports of separate Jest runs over the same sources.
 */
function mergedBranches(reports) {
  const files = new Map()
  for (const lcov of reports) {
    let branches
    for (const line of lcov.split(/\r?\n/)) {
      if (line.startsWith("SF:")) {
        const file = line.slice(3)
        branches = files.get(file) ?? new Map()
        files.set(file, branches)
      } else if (line.startsWith("BRDA:") && branches) {
        const [lineNo, block, branch, taken] = line.slice(5).split(",")
        const key = `${lineNo},${block},${branch}`
        const count = taken === "-" ? 0 : Number(taken)
        branches.set(key, (branches.get(key) ?? 0) + count)
      }
    }
  }
  return files
}

/**
 * Branch coverage of each changed file found in the LCOV reports, lowest
 * first, and the files below the branch threshold (a percentage).
 */
export function changedFileCoverage(reports, changedFiles, threshold) {
  const coverage = mergedBranches(reports)
  const files = changedFiles
    .filter((file) => coverage.has(file))
    .map((file) => {
      const taken = [...coverage.get(file).values()]
      const hit = taken.filter((count) => count > 0).length
      return {
        file,
        found: taken.length,
        hit,
        // A file without branches has nothing left to cover.
        percent: taken.length ? (100 * hit) / taken.length : 100,
      }
    })
    .sort((a, b) => a.percent - b.percent || a.file.localeCompare(b.file))
  return {
    threshold,
    files,
    below: files
      .filter(({ percent }) => percent < threshold)
      .map(({ file }) => file),
  }
}

/** The report as printed after a run, lowest coverage first. */
export function formatCoverage({ threshold, files, below }) {
  if (!files.length)
    return "No changed backend source file is measured for coverage."
  const lines = files.map(({ file, found, hit, percent }) => {
    const share = `${hit}/${found}`.padEnd(6)
    const flag = percent < threshold ? `  (below ${threshold}%)` : ""
    return `${percent.toFixed(1).padStart(7)}%    ${share} ${file}${flag}`
  })
  const summary = below.length
    ? `${below.length} changed file${below.length === 1 ? "" : "s"} below ${threshold}% branch coverage: ${below.join(", ")}`
    : `Every changed file has at least ${threshold}% branch coverage.`
  return ["Branch coverage of changed backend files:", ...lines, summary].join(
    "\n",
  )
}

/** The printed branch coverage of the changed files over the LCOV reports. */
export const changedCoverageReport = (reports, changedFiles, threshold) =>
  formatCoverage(changedFileCoverage(reports, changedFiles, threshold))

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backend = process.cwd()
  const base = changeBase()
  const paths = process.argv.slice(2)
  try {
    const reports = await Promise.all(
      (paths.length ? paths : ["coverage/lcov.info"]).map((path) =>
        readFile(path, "utf8"),
      ),
    )
    const changed = await changedBackendFiles(backend, base).catch((error) => {
      throw new Error(
        `Could not list the files changed since ${base}: ${error}`,
      )
    })
    const { branchThreshold } = coverageSettings(backend)
    console.log(changedCoverageReport(reports, changed, branchThreshold))
  } catch (error) {
    // Only a hint after a failed gate: say why it is missing, never fail.
    console.error(`No changed-file coverage report: ${error.message}`)
  }
}
