import { execFileSync, spawnSync } from "node:child_process"

// Runs the backend specs affected by changes since JEST_CHANGED_SINCE
// (default origin/main), including uncommitted and untracked files. Run it
// from apps/backend through `npm run test:affected`.
//
// Jest selects specs by following their imports. HTTP specs reach routes,
// middleware, links and Medusa configuration over HTTP instead of importing
// them, so a change there runs the whole HTTP suite.
const base = process.env.JEST_CHANGED_SINCE || "origin/main"
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean)
const changed = [
  ...git("diff", "--name-only", "--relative", base),
  ...git("ls-files", "--others", "--exclude-standard"),
]
const wholeHttpSuite = changed.filter((file) =>
  /^(src\/api\/|src\/links\/|medusa-config\.)/.test(file),
)

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
  const result = spawnSync("jest", [...args, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, TEST_TYPE: type, NODE_OPTIONS: node },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
