// Fails when a Next.js app would render with a React copy other than its own.
// Why this matters (#82): packages/next-react/README.md. This loads each app's
// Next.js config, as `next dev` does, and then asks the packages that import
// React on the app's behalf which copy they get.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { REACT_PACKAGES } from "@dtc/next-react"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_NAMES = ["next.config.js", "next.config.mjs"]
// `next` runs the built-in error pages; the Medusa UI packages are hoisted to
// the root beside React 18. An app that does not use a Medusa UI package skips it.
const REQUESTERS = [
  { name: "next", isRequired: true },
  { name: "@medusajs/icons", isRequired: false },
  { name: "@medusajs/ui", isRequired: false },
]

// Runs inside the app's directory, in a fresh Node process.
const PROBE = `
const { createRequire } = require("node:module")
const { pathToFileURL } = require("node:url")
const [config, requesters, reactPackages] = JSON.parse(process.argv[1])
import(pathToFileURL(config).href).then(() => {
  const resolutions = []
  for (const { name: requester, isRequired } of requesters) {
    let entry
    try { entry = require.resolve(requester) } catch {
      if (isRequired) throw new Error(requester + " cannot be resolved")
      continue
    }
    const requireFromRequester = createRequire(entry)
    for (const name of reactPackages) {
      const file = requireFromRequester.resolve(name + "/package.json")
      resolutions.push({ requester, name, file })
    }
  }
  process.stdout.write(JSON.stringify(resolutions))
  process.exit(0)
})
`

const apps = readdirSync(join(ROOT, "apps"))
  .map((name) => join(ROOT, "apps", name))
  .filter((appDir) =>
    CONFIG_NAMES.some((name) => existsSync(join(appDir, name))),
  )

const problems = []
for (const appDir of apps) {
  const app = relative(ROOT, appDir)
  const config = CONFIG_NAMES.map((name) => join(appDir, name)).find(existsSync)
  // This process installs no hook, so this is the copy the app itself sees.
  const requireFromApp = createRequire(join(appDir, "package.json"))
  const resolutions = JSON.parse(
    execFileSync(
      process.execPath,
      ["-e", PROBE, JSON.stringify([config, REQUESTERS, REACT_PACKAGES])],
      {
        cwd: appDir,
        encoding: "utf8",
        // The storefront config refuses to load without these; their values do
        // not matter here.
        env: {
          ...process.env,
          NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "pk_check",
          NEXT_PUBLIC_MEDUSA_BACKEND_URL:
            process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
            "http://localhost:9000",
        },
      },
    ),
  )
  for (const { requester, name, file } of resolutions) {
    const expected = requireFromApp.resolve(`${name}/package.json`)
    if (file !== expected)
      problems.push(
        `${app}: ${requester} gets ${name} from ${relative(ROOT, file)}, expected ${relative(ROOT, expected)}`,
      )
  }
  console.log(`${app}: ${resolutions.length} React imports checked`)
}

if (problems.length) {
  console.error(
    [
      "A Next.js app resolves a React copy other than its own:",
      ...problems.map((problem) => `  ${problem}`),
      "Call pinOwnReact from @dtc/next-react at the top of the app's Next.js config.",
    ].join("\n"),
  )
  process.exit(1)
}
