import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * One kind of automated test: where its spec files live, what runs them and
 * which stage of the quality gate to main runs them. Keep `matches` in step
 * with the runner configuration (apps/backend/jest.config.js, the package.json
 * test scripts and the Playwright configs).
 */
type KindDefinition = {
  id: string
  name: string
  runner: string
  location: string
  gate: string
  /** Repository-relative paths of this kind's spec files */
  matches: RegExp
  /** Files that match but belong to another kind */
  excludes?: RegExp
}

export type TestKind = Omit<KindDefinition, "matches" | "excludes"> & {
  files: number
  tests: number
}

export type TestInventory = {
  kinds: TestKind[]
  total: { files: number; tests: number }
}

export const KINDS: KindDefinition[] = [
  {
    id: "backend-unit",
    name: "Backend unit",
    runner: "Jest",
    location: "apps/backend/src/**/__tests__/**/*.unit.spec.ts",
    gate: "Every commit (trunk-worthy) and the ready flow (coverage)",
    matches:
      /^apps\/backend\/src\/(.+\/)?__tests__\/(.+\/)?[^/]+\.unit\.spec\.[jt]s$/,
  },
  {
    id: "backend-modules",
    name: "Backend module integration",
    runner: "Jest with PostgreSQL",
    location: "apps/backend/src/modules/*/__tests__/**",
    gate: "Ready flow (backend job)",
    matches:
      /^apps\/backend\/src\/modules\/[^/]+\/__tests__\/(.+\/)?[^/]+\.[jt]s$/,
    // Jest also matches unit specs here; they are counted once, as unit tests
    excludes: /\.unit\.spec\.[jt]s$/,
  },
  {
    id: "backend-http",
    name: "Backend HTTP integration",
    runner: "Jest with PostgreSQL",
    location: "apps/backend/integration-tests/http/*.spec.ts",
    gate: "Ready flow (three coverage shards)",
    matches: /^apps\/backend\/integration-tests\/http\/[^/]+\.spec\.[jt]s$/,
  },
  {
    id: "browser-e2e",
    name: "Browser end-to-end",
    runner: "Playwright (Chromium)",
    location: "apps/storefront/e2e/, apps/partner/e2e/",
    gate: "Ready flow (application builds), affected journeys",
    matches: /^apps\/(storefront|partner)\/e2e\/(.+\/)?[^/]+\.spec\.[jt]s$/,
  },
  {
    id: "partner-unit",
    name: "Partner app unit",
    runner: "Node test runner",
    location: "apps/partner/src/**/__tests__/*.unit.spec.ts",
    gate: "Every commit (trunk-worthy)",
    matches: /^apps\/partner\/src\/(.+\/)?__tests__\/[^/]+\.unit\.spec\.[jt]s$/,
  },
  {
    id: "package-unit",
    name: "Shared package unit",
    runner: "Node test runner",
    location: "packages/*/",
    gate: "Every commit (trunk-worthy)",
    matches:
      /^packages\/[^/]+\/(src\/)?__tests__\/(.+\/)?[^/]+\.(unit\.spec\.[jt]s|test\.cjs)$/,
  },
  {
    id: "docs",
    name: "Docs site and flow metrics",
    runner: "Vitest",
    location: "apps/docs/**/*.test.ts",
    gate: "Ready flow (docs job)",
    matches: /^apps\/docs\/(scripts|src)\/(.+\/)?[^/]+\.test\.ts$/,
  },
  {
    id: "tooling",
    name: "Repository tooling",
    runner: "Node test runner",
    location: "scripts/*.test.mjs",
    gate: "Every commit (trunk-worthy) and the ready flow (application builds)",
    matches: /^scripts\/[^/]+\.test\.mjs$/,
  },
]

const ignored = new Set([
  ".git",
  "node_modules",
  ".medusa",
  ".next",
  ".turbo",
  "dist",
  "out",
])

/** Repository-relative file paths, without installed packages and build output */
function listFiles(root: string, dir = ""): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory())
        return ignored.has(entry.name) ? [] : listFiles(root, path)
      return entry.isFile() ? [path] : []
    },
  )
}

/**
 * Declared test cases: `it(` and `test(` at the start of a line, with their
 * modifiers. A table test (`it.each`) counts once, however many rows it has.
 */
export function countTestCases(source: string): number {
  return (
    source.match(
      /^\s*(?:it|test)(?:\.(?:only|skip|todo|fixme|fail|concurrent|each))*\s*\(/gm,
    )?.length ?? 0
  )
}

export function takeTestInventory(repoRoot: string): TestInventory {
  const paths = listFiles(repoRoot)
  const kinds = KINDS.map(({ matches, excludes, ...kind }) => {
    const files = paths.filter(
      (path) => matches.test(path) && !excludes?.test(path),
    )
    const tests = files.reduce(
      (sum, path) =>
        sum + countTestCases(readFileSync(join(repoRoot, path), "utf8")),
      0,
    )
    return { ...kind, files: files.length, tests }
  })
  return {
    kinds,
    total: {
      files: kinds.reduce((sum, kind) => sum + kind.files, 0),
      tests: kinds.reduce((sum, kind) => sum + kind.tests, 0),
    },
  }
}
