import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"

// Runs the backend specs affected by changes since JEST_CHANGED_SINCE
// (default origin/main), including uncommitted and untracked files. Run it
// from apps/backend through `npm run test:affected`.
//
// Jest selects specs by following their imports. HTTP specs reach routes,
// middleware, links and Medusa configuration over HTTP instead of importing
// them, so a change there runs the whole HTTP suite.
//
// Commands run by absolute path, never through a PATH lookup: Jest's own
// binary on the current Node executable, and Jest's changed-files library
// instead of spawning git, so "changed" means exactly what --changedSince uses.
const backend = process.cwd()
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

const base = process.env.JEST_CHANGED_SINCE || "origin/main"
const { changedFiles } = await getChangedFilesForRoots([backend], {
  changedSince: base,
})
const wholeHttpSuite = [...changedFiles]
  .map((file) => relative(backend, file))
  .filter((file) => /^(src\/api\/|src\/links\/|medusa-config\.)/.test(file))

const node = "--experimental-vm-modules"
const since = [`--changedSince=${base}`, "--passWithNoTests"]
const workers = `--maxWorkers=${process.env.JEST_MAX_WORKERS || "1"}`
const suites = [
  ["unit", ["--silent", ...since]],
  ["integration:modules", ["--silent", "--runInBand", "--forceExit", ...since]],
  [
    "integration:http",
    wholeHttpSuite.length > 0
      ? ["--silent=false", workers, "--forceExit"]
      : ["--silent=false", workers, "--forceExit", ...since],
  ],
]

if (wholeHttpSuite.length > 0)
  console.log(
    `Running every HTTP spec: changed ${wholeHttpSuite.slice(0, 3).join(", ")}${wholeHttpSuite.length > 3 ? ", ..." : ""}`,
  )
for (const [type, args] of suites) {
  // Extra arguments go to every Jest run, e.g. `-- --listTests` for a dry run.
  const result = spawnSync(
    process.execPath,
    [jestBin, ...args, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, TEST_TYPE: type, NODE_OPTIONS: node },
    },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
}
