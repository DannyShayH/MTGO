import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(
  new URL("../../../.github/workflows/on_main.yml", import.meta.url),
  "utf8",
)
const job = workflow
  .split("  deploy_artifact_to_pages:")[1]
  .split("\n  # Staging")[0]
const steps = job.split(/\n      - name: /).slice(1)

function step(name: string) {
  const found = steps.find((item) => item.startsWith(`${name}\n`))
  if (!found) throw new Error(`Missing workflow step: ${name}`)
  return found
}

describe("Pages deployment workflow", () => {
  it("downloads the tested commit and isolates rerun artifacts", () => {
    expect(step("Download the tested docs site")).toContain(
      "github-pages-$GITHUB_SHA",
    )
    const name = "github-pages-${{ github.run_id }}-${{ github.run_attempt }}"
    expect(step("Upload the Pages artifact for this attempt")).toContain(
      `name: ${name}`,
    )
    for (const attempt of [1, 2, 3]) {
      expect(step(`Deploy docs (attempt ${attempt})`)).toContain(
        `artifact_name: ${name}`,
      )
    }
  })

  it("retries failed deployments with bounded waits and reports the final result", () => {
    for (const [attempt, delay] of [
      [2, 15],
      [3, 30],
    ]) {
      const condition = `if: steps.pages_${attempt - 1}.outcome == 'failure'`
      expect(step(`Wait before attempt ${attempt}`)).toContain(condition)
      expect(step(`Wait before attempt ${attempt}`)).toContain(`sleep ${delay}`)
      expect(step(`Deploy docs (attempt ${attempt})`)).toContain(condition)
    }
    for (const attempt of [1, 2, 3]) {
      const deploy = step(`Deploy docs (attempt ${attempt})`)
      expect(deploy).toContain("uses: actions/deploy-pages@v5")
      expect(deploy).toContain("continue-on-error: true")
    }
    const report = step("Report docs deployment")
    expect(report).toContain("if: always()")
    expect(report).toContain(
      "steps.pages_1.outcome == 'success' || steps.pages_2.outcome == 'success' || steps.pages_3.outcome == 'success'",
    )
    expect(report).toContain("-f context=deploy:pages")
    expect(report).toContain('[[ "$state" == success ]]')
  })
})

it.each([
  {
    results: ["failure", "success"],
    status: "success",
    calls: 2,
    reason: "DT R1: retry succeeds",
  },
  {
    results: ["failure", "failure", "success"],
    status: "success",
    calls: 3,
    reason: "DT R2: final attempt succeeds",
  },
  {
    results: ["failure", "failure", "failure"],
    status: "failure",
    calls: 3,
    reason: "DT R3: all attempts fail",
  },
  {
    results: ["success"],
    status: "success",
    calls: 1,
    reason: "DT R4: first attempt succeeds",
  },
])("$reason", async ({ results, status, calls }) => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { spawnSync } = await import("node:child_process")
  const dir = mkdtempSync(join(tmpdir(), "pages-workflow-"))
  try {
    const outcomes: string[] = []
    for (let i = 1; i <= 3; i++) {
      const deploy = step(`Deploy docs (attempt ${i})`)
      const condition = deploy.match(
        /if: steps\.pages_(\d)\.outcome == 'failure'/,
      )
      if (condition && outcomes[Number(condition[1]) - 1] !== "failure") break
      outcomes.push(results[i - 1])
    }
    expect(outcomes).toHaveLength(calls)
    const report = step("Report docs deployment")
    const expression = report.match(/PAGE_OUTCOME: \$\{\{ (.*?) \}\}/)?.[1]
    if (!expression) throw new Error("Missing outcome expression")
    const matches = [
      ...expression.matchAll(/steps\.pages_(\d)\.outcome == 'success'/g),
    ]
    expect(matches).toHaveLength(3)
    const success = matches.some(
      (match) => outcomes[Number(match[1]) - 1] === "success",
    )
    const script = report
      .split("        run: |\n")[1]
      .replace(/^          /gm, "")
    writeFileSync(
      join(dir, "gh"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$STATUS_CAPTURE"\n',
      { mode: 0o755 },
    )
    const result = spawnSync("bash", ["-e", "-c", script], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        STATUS_CAPTURE: join(dir, "status"),
        GITHUB_STEP_SUMMARY: join(dir, "summary"),
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_SHA: "abc",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_RUN_ID: "42",
        PAGE_OUTCOME: String(success),
        PAGE_URL: "https://example.com",
      },
      encoding: "utf8",
    })
    expect(result.status).toBe(status === "success" ? 0 : 1)
    expect(readFileSync(join(dir, "status"), "utf8")).toContain(
      `state=${status}`,
    )
    expect(readFileSync(join(dir, "status"), "utf8")).toContain(
      "context=deploy:pages",
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it("selects only the current attempt's artifact when a previous attempt remains", () => {
  const upload = step("Upload the Pages artifact for this attempt")
  const template = upload.match(/name: (github-pages-.*)/)?.[1]
  if (!template) throw new Error("Missing upload artifact name")
  const name = (attempt: number) =>
    template
      .replace("${{ github.run_id }}", "42")
      .replace("${{ github.run_attempt }}", String(attempt))
  const artifacts = [name(1), name(2)]
  for (const attempt of [1, 2, 3]) {
    expect(step(`Deploy docs (attempt ${attempt})`)).toContain(
      `artifact_name: ${template}`,
    )
  }
  expect(artifacts.filter((artifact) => artifact === name(2))).toEqual([
    "github-pages-42-2",
  ])
})

it.each([
  {
    reason: "DT R1: skip an unsuccessful docs job",
    jobs: "false true",
    selected: "22",
    succeeds: true,
  },
  {
    reason: "DT R2: reject runs without a successful docs job",
    jobs: "false false",
    selected: "",
    succeeds: false,
  },
])("$reason", async ({ jobs, selected, succeeds }) => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { spawnSync } = await import("node:child_process")
  const dir = mkdtempSync(join(tmpdir(), "pages-source-"))
  try {
    mkdirSync(join(dir, "apps/docs/dist"), { recursive: true })
    writeFileSync(join(dir, "apps/docs/dist/index.html"), "site")
    writeFileSync(
      join(dir, "gh"),
      `#!/bin/bash
if [[ "$1 $2" == "api --paginate" && "$*" == *"/workflows/"* ]]; then
  printf '11\\n22\\n'
elif [[ "$1 $2" == "api --paginate" && "$*" == *"/11/jobs"* ]]; then
  echo "${jobs.split(" ")[0]}"
elif [[ "$1 $2" == "api --paginate" && "$*" == *"/22/jobs"* ]]; then
  echo "${jobs.split(" ")[1]}"
elif [[ "$1 $2" == "run download" ]]; then
  printf '%s' "$3" > "$CAPTURE"
else
  exit 1
fi
`,
      { mode: 0o755 },
    )
    const script = step("Download the tested docs site")
      .split("        run: |\n")[1]
      .replace(/^          /gm, "")
    const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CAPTURE: join(dir, "capture"),
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_SHA: "abc",
      },
      encoding: "utf8",
    })
    expect(result.status).toBe(succeeds ? 0 : 1)
    if (succeeds)
      expect(readFileSync(join(dir, "capture"), "utf8")).toBe(selected)
    else expect(result.stdout).toContain("No successful Ready docs job")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
