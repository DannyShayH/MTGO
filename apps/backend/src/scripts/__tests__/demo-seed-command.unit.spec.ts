import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// `mtogo-deploy.sh demo-seed` (#258): the one documented way the demo world
// reaches the staging database. The script is sourced with Docker, the
// backup and the Droplet's file checks replaced by stubs that record what
// they were asked to do, so this shows the command's order and refusals,
// not that the seed runs; the administrator checks that on staging.
const script = join(__dirname, "../../../../../deploy/staging/mtogo-deploy.sh")

type Options = {
  args: string
  ciCaller?: boolean
  running?: boolean
  missing?: string
}

function runDemoSeed({
  args,
  ciCaller = false,
  running = false,
  missing,
}: Options) {
  const dir = mkdtempSync(join(tmpdir(), "demo-seed-"))
  const log = join(dir, "calls")
  spawnSync("touch", [log])
  const { status, stdout, stderr } = spawnSync(
    "bash",
    [
      "-c",
      [
        `source "${script}"`,
        "check_env_file() { :; }",
        "current_release() { printf '0123456789abcdef0123456789abcdef01234567'; }",
        `env_value() { [[ "$1" == "${missing ?? "none"}" ]] && die "$1 is missing in $ENV_FILE"; printf 'neverPrintedSecret0123'; }`,
        // Stubs record their calls in a file: the script silences some output.
        'take_lock() { echo "take_lock" >> "$CALLS"; }',
        'database_backup() { echo "backup $1" >> "$CALLS"; }',
        'compose() { shift; echo "compose $*" >> "$CALLS"; }',
        `docker() { if [[ "$1 $2" == "ps -q" ]]; then ${running ? "echo abc123" : ":"}; else echo "docker $*" >> "$CALLS"; fi; }`,
        `CI_CALLER=${ciCaller ? 1 : 0}`,
        "require_ci_command demo-seed",
        `cmd_demo_seed ${args}`,
      ].join("\n"),
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH, CALLS: log } },
  )
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean)
  rmSync(dir, { recursive: true })
  return { status, stdout, stderr, calls }
}

describe("mtogo-deploy.sh demo-seed", () => {
  it("backs up the database, then starts the seed in the background", () => {
    const { status, calls, stdout, stderr } = runDemoSeed({ args: "start" })
    expect(status).toBe(0)
    expect(calls).toEqual([
      "take_lock",
      "backup 0123456789abcdef0123456789abcdef01234567",
      "docker rm mtogo-demo-seed",
      "compose run -d --name mtogo-demo-seed demo-seed",
    ])
    // The demo password never reaches the output or the command line.
    expect(stdout + stderr).not.toContain("neverPrintedSecret")
  })

  it("starts by default when no action is given", () => {
    expect(runDemoSeed({ args: "" }).calls).toContain(
      "compose run -d --name mtogo-demo-seed demo-seed",
    )
  })

  it("refuses a second run while one is still going, before any backup", () => {
    const { status, calls, stderr } = runDemoSeed({
      args: "start",
      running: true,
    })
    expect(status).not.toBe(0)
    expect(stderr).toContain("still running")
    expect(calls).toEqual([])
  })

  it.each(["DEMO_WORLD_PASSWORD", "DEMO_WORLD_EMAIL_DOMAIN"])(
    "refuses to start without %s in the Droplet .env",
    (name) => {
      const { status, calls, stderr } = runDemoSeed({
        args: "start",
        missing: name,
      })
      expect(status).not.toBe(0)
      expect(stderr).toContain(`${name} is missing`)
      expect(calls).toEqual([])
    },
  )

  it("follows the seed's logs and shows its status", () => {
    expect(runDemoSeed({ args: "logs" }).calls).toEqual([
      "docker logs --follow --tail 40 mtogo-demo-seed",
    ])
    expect(runDemoSeed({ args: "status" }).calls[0]).toMatch(
      /^docker ps -a --filter name=\^mtogo-demo-seed\$/,
    )
  })

  it("refuses an unknown action", () => {
    const { status, stderr } = runDemoSeed({ args: "wipe" })
    expect(status).not.toBe(0)
    expect(stderr).toContain("unknown demo-seed action")
  })

  it("is for administrators only: the CI deploy key cannot start it", () => {
    const { status, calls, stderr } = runDemoSeed({
      args: "start",
      ciCaller: true,
    })
    expect(status).not.toBe(0)
    expect(stderr).toContain("demo-seed is for administrators only")
    expect(calls).toEqual([])
  })
})
