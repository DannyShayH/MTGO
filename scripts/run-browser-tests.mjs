import { spawnSync } from "node:child_process"
import { resolveExecutable } from "./resolve-executable.mjs"

const app = process.argv[2]
if (!["partner", "storefront"].includes(app))
  throw new Error("Expected partner or storefront")
const selection = JSON.parse(
  process.env.BROWSER_TEST_SELECTION || '{"partner":["*"],"storefront":["*"]}',
)
const files = selection[app]
if (
  !Array.isArray(files) ||
  files.some((file) => file !== "*" && !/^[a-z0-9.-]+\.spec\.ts$/.test(file))
)
  throw new Error("Invalid browser test selection")
console.log(`${app} browser journeys: ${files.join(", ") || "none affected"}`)
if (files.length) {
  const result = spawnSync(
    resolveExecutable("npm"),
    ["run", "test:e2e", "--", ...(files.includes("*") ? [] : files)],
    { stdio: "inherit", env: process.env },
  )
  process.exitCode = result.status ?? 1
}
