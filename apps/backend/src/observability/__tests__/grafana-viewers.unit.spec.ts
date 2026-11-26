import { spawnSync } from "node:child_process"
import { join } from "node:path"

// `mtogo-deploy.sh monitoring viewers` (#181): who can sign in to staging
// Grafana. The script is sourced with Grafana's HTTP API and the Droplet's
// file checks replaced, so this shows the listing, not that Grafana answers;
// the developer checks that on staging.
const script = join(__dirname, "../../../../../deploy/staging/mtogo-deploy.sh")

// GET /api/org/users as Grafana 13 answers it (org.OrgUserDTO). Grafana
// creates an account with lastSeenAt ten years before its creation; its own
// user list shows such an account as "Never".
const orgUsers = JSON.stringify([
  {
    orgId: 1,
    userId: 1,
    uid: "a1b2c3",
    email: "admin@localhost",
    name: "Staging Admin",
    avatarUrl: "/avatar/46d229b033af06a191ff2267bca9ae56",
    login: "staging-admin",
    role: "Admin",
    lastSeenAt: "2026-11-25T09:14:07Z",
    created: "2026-11-19T18:02:11Z",
    lastSeenAtAge: "1 day",
    isDisabled: false,
    authLabels: null,
    isExternallySynced: false,
    isProvisioned: false,
  },
  {
    orgId: 1,
    userId: 2,
    uid: "d4e5f6",
    email: "anna",
    name: "anna",
    avatarUrl: "/avatar/a0f2b7c3",
    login: "anna",
    role: "Viewer",
    lastSeenAt: "2026-11-26T07:45:59+01:00",
    created: "2026-11-21T10:00:00Z",
    lastSeenAtAge: "10 minutes",
    isDisabled: false,
    authLabels: [],
    isExternallySynced: false,
    isProvisioned: false,
  },
  {
    orgId: 1,
    userId: 3,
    uid: "g7h8i9",
    email: "bo.k@example.test",
    name: "bo.k",
    avatarUrl: "/avatar/77aa",
    login: "bo.k",
    role: "Viewer",
    lastSeenAt: "2016-11-26T10:00:00Z",
    created: "2026-11-26T10:00:00Z",
    lastSeenAtAge: "10 years",
    isDisabled: false,
    authLabels: [],
    isExternallySynced: false,
    isProvisioned: false,
  },
])

type Run = { status: number | null; stdout: string; stderr: string }

/** Sources the script as root's administrator would run it, with Grafana answering `response`. */
const runMonitoring = (
  args: string,
  response: string | null,
  ciCaller = false,
): Run => {
  const grafana =
    response === null
      ? "grafana_api() { echo 'curl: (7) Failed to connect' >&2; return 7; }"
      : `grafana_api() { [[ "$1 $2" == "GET /api/org/users" ]] || return 22; printf '%s' "$GRAFANA_RESPONSE"; }`
  const { status, stdout, stderr } = spawnSync(
    "bash",
    [
      "-c",
      [
        `source "${script}"`,
        "check_env_file() { :; }",
        "env_value() { printf 'neverPrintedSecret0123456789'; }",
        "env_optional() { [[ $1 == STAGING_METRICS_ENABLED ]] && printf 1; }",
        grafana,
        `CI_CALLER=${ciCaller ? 1 : 0}`,
        `require_ci_command monitoring`,
        `cmd_monitoring ${args}`,
      ].join("\n"),
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        TZ: "Europe/Copenhagen",
        GRAFANA_RESPONSE: response ?? "",
      },
    },
  )
  return { status, stdout, stderr }
}

describe("monitoring viewers", () => {
  it("lists each account's login, role and last sign-in in UTC, or never", () => {
    const { status, stdout, stderr } = runMonitoring("viewers", orgUsers)
    expect(stderr).toBe("")
    expect(status).toBe(0)
    expect(stdout.split("\n")).toEqual([
      "LOGIN                    ROLE      LAST SIGN-IN",
      "staging-admin            Admin     2026-11-25 09:14 UTC",
      "anna                     Viewer    2026-11-26 06:45 UTC",
      "bo.k                     Viewer    never",
      "",
    ])
  })

  // Grafana's rule: an account whose lastSeenAt is before its creation has
  // never signed in.
  it.each([
    {
      lastSeenAt: "2016-11-21T10:00:00Z",
      expected: "never",
      reason: "EP: ten years before creation, as Grafana creates an account",
    },
    {
      lastSeenAt: "2026-11-21T09:59:00Z",
      expected: "never",
      reason: "BVA: one minute before creation",
    },
    {
      lastSeenAt: "2026-11-21T10:00:00Z",
      expected: "2026-11-21 10:00 UTC",
      reason: "BVA: at creation counts as a sign-in",
    },
    {
      lastSeenAt: "2026-11-21T10:01:00Z",
      expected: "2026-11-21 10:01 UTC",
      reason: "BVA: one minute after creation",
    },
    {
      lastSeenAt: "2026-11-21T12:30:00+02:00",
      expected: "2026-11-21 10:30 UTC",
      reason: "EP: a time with an offset is shown in UTC",
    },
    {
      lastSeenAt: undefined,
      expected: "never",
      reason: "EP invalid: no lastSeenAt",
    },
    {
      lastSeenAt: "2026-11-21T10:01:00Z",
      created: null,
      expected: "never",
      reason: "EP invalid: no creation time to compare with",
    },
  ])(
    "last sign-in is $expected: $reason",
    ({ lastSeenAt, created, expected }) => {
      const account = {
        login: "anna",
        role: "Viewer",
        lastSeenAt,
        created: created === null ? undefined : "2026-11-21T10:00:00Z",
      }
      const { status, stdout } = runMonitoring(
        "viewers",
        JSON.stringify([account]),
      )
      expect(status).toBe(0)
      expect(stdout.split("\n")[1]).toBe(
        `anna                     Viewer    ${expected}`,
      )
    },
  )

  it("prints no e-mail address, name or admin password", () => {
    const { stdout } = runMonitoring("viewers", orgUsers)
    for (const hidden of [
      "@",
      "Staging Admin",
      "neverPrintedSecret",
      "avatar",
      "a1b2c3",
    ])
      expect(stdout).not.toContain(hidden)
  })

  it("is refused for the CI identity, like the other monitoring commands", () => {
    const { status, stdout, stderr } = runMonitoring("viewers", orgUsers, true)
    expect(status).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toBe(
      "[mtogo-deploy] ERROR: monitoring is for administrators only\n",
    )
  })

  it("fails with a hint when Grafana does not answer", () => {
    const { status, stdout, stderr } = runMonitoring("viewers", null)
    expect(status).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toContain(
      "Grafana did not list its accounts (is monitoring up?)",
    )
  })

  it("takes no arguments", () => {
    const { status, stderr } = runMonitoring("viewers anna", orgUsers)
    expect(status).toBe(1)
    expect(stderr).toBe(
      "[mtogo-deploy] ERROR: monitoring viewers takes no arguments\n",
    )
  })
})
