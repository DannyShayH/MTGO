import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const script = fileURLToPath(
  new URL("../../../scripts/workon.sh", import.meta.url),
)
let fixture: string

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "workon-"))
  const bin = join(fixture, "bin")
  mkdirSync(bin)
  writeFileSync(
    join(fixture, ".tt-config.json"),
    JSON.stringify({ project: { owner: "example", number: 2 } }),
  )
  writeFileSync(join(fixture, "gh-calls.jsonl"), "")
  writeFileSync(
    join(bin, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  'rev-parse --abbrev-ref HEAD') echo '59-example' ;;
  'rev-parse --show-toplevel') echo "$WORKON_TEST_ROOT" ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(process.env.WORKON_TEST_ROOT + "/gh-calls.jsonl", JSON.stringify(args) + "\\n")
switch (args.slice(0, 2).join(" ")) {
  case "tt workon": break
  case "project item-list":
    console.log(args.at(-1).endsWith("| .id") ? "item-id" : process.env.WORKON_TEST_EXISTING_DATE)
    break
  case "project view": console.log("project-id"); break
  case "project field-list": console.log("field-id"); break
  case "project item-edit": break
  default: process.exit(1)
}
`,
    { mode: 0o755 },
  )
  // Freeze the instant while retaining the system date command's timezone rules.
  writeFileSync(
    join(bin, "date"),
    `#!/usr/bin/env bash
exec /usr/bin/date --date="$WORKON_TEST_INSTANT" "$@"
`,
    { mode: 0o755 },
  )
})

afterEach(() => rmSync(fixture, { recursive: true, force: true }))

function startWork(instant: string, timezone: string, existingDate = "") {
  const result = spawnSync("bash", [script, "-i", "59"], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
      TZ: timezone,
      WORKON_TEST_ROOT: fixture,
      WORKON_TEST_INSTANT: instant,
      WORKON_TEST_EXISTING_DATE: existingDate,
    },
  })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  const calls: string[][] = readFileSync(
    join(fixture, "gh-calls.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  expect(calls[0]).toEqual(["tt", "workon", "-i", "59"])
  return calls.filter(
    (args) => args[0] === "project" && args[1] === "item-edit",
  )
}

describe("work-start Start date", () => {
  it.each([
    {
      instant: "2026-11-11T23:00:00Z",
      timezone: "UTC",
      expected: "2026-11-12",
      reason:
        "BVA: Copenhagen midnight in winter while UTC is the previous day",
    },
    {
      instant: "2026-11-11T22:59:59Z",
      timezone: "UTC",
      expected: "2026-11-11",
      reason: "BVA: one second before winter midnight",
    },
    {
      instant: "2026-11-11T23:00:01Z",
      timezone: "UTC",
      expected: "2026-11-12",
      reason: "BVA: one second after winter midnight",
    },
    {
      instant: "2026-07-01T21:59:59Z",
      timezone: "UTC",
      expected: "2026-07-01",
      reason: "BVA: one second before summer midnight",
    },
    {
      instant: "2026-07-01T22:00:00Z",
      timezone: "UTC",
      expected: "2026-07-02",
      reason: "BVA: summer midnight uses the daylight-saving offset",
    },
    {
      instant: "2026-07-01T22:00:01Z",
      timezone: "America/Los_Angeles",
      expected: "2026-07-02",
      reason:
        "BVA: after summer midnight with a machine timezone behind Copenhagen",
    },
    {
      instant: "2026-11-11T22:59:59Z",
      timezone: "Asia/Tokyo",
      expected: "2026-11-11",
      reason: "EP: machine timezone ahead of Copenhagen",
    },
    {
      instant: "2026-03-29T00:59:59Z",
      timezone: "UTC",
      expected: "2026-03-29",
      reason: "BVA: immediately before spring clock change",
    },
    {
      instant: "2026-03-29T01:00:00Z",
      timezone: "UTC",
      expected: "2026-03-29",
      reason: "BVA: at spring clock change",
    },
    {
      instant: "2026-03-29T01:00:01Z",
      timezone: "UTC",
      expected: "2026-03-29",
      reason: "BVA: immediately after spring clock change",
    },
    {
      instant: "2026-10-25T00:59:59Z",
      timezone: "UTC",
      expected: "2026-10-25",
      reason: "BVA: immediately before autumn clock change",
    },
    {
      instant: "2026-10-25T01:00:00Z",
      timezone: "UTC",
      expected: "2026-10-25",
      reason: "BVA: at autumn clock change",
    },
    {
      instant: "2026-10-25T01:00:01Z",
      timezone: "UTC",
      expected: "2026-10-25",
      reason: "BVA: immediately after autumn clock change",
    },
  ])("$reason", ({ instant, timezone, expected }) => {
    expect(startWork(instant, timezone)).toEqual([
      [
        "project",
        "item-edit",
        "--project-id",
        "project-id",
        "--id",
        "item-id",
        "--field-id",
        "field-id",
        "--date",
        expected,
      ],
    ])
  })
  it.each([
    {
      existingDate: "2026-11-11",
      reason: "DT: historical date differs from today's Copenhagen date",
    },
    {
      existingDate: "2026-11-12",
      reason: "DT: existing date matches today's Copenhagen date",
    },
  ])("$reason", ({ existingDate }) => {
    expect(startWork("2026-11-11T23:00:00Z", "UTC", existingDate)).toEqual([])
  })
})
