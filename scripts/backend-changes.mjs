import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"

/**
 * Jest's binary, its changed-files library and its glob matcher, resolved
 * from the backend by absolute path rather than a PATH lookup, so "changed"
 * means exactly what Jest's --changedSince uses: committed since the base,
 * uncommitted and untracked.
 */
export function backendJest(backend) {
  const fromBackend = createRequire(join(backend, "package.json"))
  const jestPackage = fromBackend.resolve("jest/package.json")
  // The package's exports hide its binary, so follow its "bin" field as npm does.
  const { bin } = fromBackend(jestPackage)
  const jestBin = join(
    dirname(jestPackage),
    typeof bin === "string" ? bin : bin.jest,
  )
  const fromJestCore = createRequire(
    createRequire(jestPackage).resolve("@jest/core/package.json"),
  )
  const { getChangedFilesForRoots } = fromJestCore("jest-changed-files")
  // Jest's coverage reporter: its glob matcher for collectCoverageFrom and
  // the Istanbul libraries it merges and writes coverage with.
  const fromReporters = createRequire(
    fromJestCore.resolve("@jest/reporters/package.json"),
  )
  const micromatch = fromReporters("micromatch")
  return { jestBin, getChangedFilesForRoots, micromatch, fromReporters }
}

/**
 * What the ready coverage gate measures, from jest.config.js: the source
 * globs, the global thresholds and the global branch threshold (percentages).
 */
export function coverageSettings(backend) {
  const { collectCoverageFrom, coverageThreshold } = createRequire(
    join(backend, "package.json"),
  )("./jest.config.js")
  return {
    collectCoverageFrom,
    thresholds: coverageThreshold.global,
    branchThreshold: coverageThreshold.global.branches,
  }
}

/** The changed files the coverage gate measures. */
export function measuredFiles(backend, changedFiles) {
  const { micromatch } = backendJest(backend)
  return micromatch(changedFiles, coverageSettings(backend).collectCoverageFrom)
}

/** A file path as a glob matching only itself, e.g. for `[id]` route folders. */
export const literalGlob = (file) => file.replace(/[[\]{}()*?!+@]/g, "\\$&")

/** The base that changes are measured from: JEST_CHANGED_SINCE or origin/main. */
export const changeBase = () => process.env.JEST_CHANGED_SINCE || "origin/main"

/** Files changed under the backend since the base, relative to the backend. */
export async function changedBackendFiles(backend, base = changeBase()) {
  const { getChangedFilesForRoots } = backendJest(backend)
  const { changedFiles } = await getChangedFilesForRoots([backend], {
    changedSince: base,
  })
  return [...changedFiles].map((file) => relative(backend, file)).sort()
}
