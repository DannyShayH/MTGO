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
  // The glob matcher Jest's coverage reporter applies to collectCoverageFrom.
  const micromatch = createRequire(
    fromJestCore.resolve("@jest/reporters/package.json"),
  )("micromatch")
  return { jestBin, getChangedFilesForRoots, micromatch }
}

/**
 * What the ready coverage gate measures, from jest.config.js: the source
 * globs and the global branch threshold (a percentage).
 */
export function coverageSettings(backend) {
  const { collectCoverageFrom, coverageThreshold } = createRequire(
    join(backend, "package.json"),
  )("./jest.config.js")
  return {
    collectCoverageFrom,
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
