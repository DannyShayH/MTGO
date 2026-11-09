import { spawn, execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

// Framework CLIs load .env implicitly. Verify in a source snapshot that has none.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const database = new URL(
  process.env.DATABASE_URL || "postgres://invalid/invalid",
)
const isLoopback = (hostname) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
if (
  !isLoopback(database.hostname) ||
  !database.pathname.startsWith("/medusa_ci_")
) {
  throw new Error(
    "Verification requires a loopback PostgreSQL database named medusa_ci_*",
  )
}
for (const name of ["NEXT_PUBLIC_MEDUSA_BACKEND_URL", "NEXT_PUBLIC_BASE_URL"]) {
  if (!process.env[name] || !isLoopback(new URL(process.env[name]).hostname)) {
    throw new Error(`${name} must point to the disposable loopback runtime`)
  }
}

// Refuse existing application servers rather than testing another local store.
for (const port of [9000, 8000]) {
  await new Promise((done, fail) => {
    const server = createServer()
    server.once("error", () =>
      fail(new Error(`Port ${port} must be free for verification`)),
    )
    server.listen(port, () => server.close(done))
  })
}

await mkdir(join(root, "tmp"), { recursive: true })
const snapshot = await mkdtemp(join(root, "tmp", "application-verification-"))
let result = 1
try {
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--full-name",
      "-z",
      "--",
      ":/",
    ],
    { cwd: root, encoding: "utf8" },
  ).split("\0")
  for (const file of files) {
    if (
      !file ||
      file
        .split("/")
        .some((part) => part.startsWith(".env") && !part.endsWith(".template"))
    )
      continue
    const destination = join(snapshot, file)
    await mkdir(dirname(destination), { recursive: true })
    try {
      await cp(join(root, file), destination)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  // The snapshot is on the same filesystem; hard links keep dependencies inside
  // Turbopack's root without another install or a second lockfile.
  const apps = await readdir(join(root, "apps"))
  for (const directory of ["", ...apps.map((app) => join("apps", app))]) {
    const source = join(root, directory, "node_modules")
    const probe = spawn("test", ["-d", source])
    const exists = await new Promise((done) =>
      probe.on("close", (code) => done(code === 0)),
    )
    if (exists)
      execFileSync("cp", [
        "-al",
        source,
        join(snapshot, directory, "node_modules"),
      ])
  }
  const allowedEnvironment = [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "CI",
    "GITHUB_ACTIONS",
    "PLAYWRIGHT_BROWSERS_PATH",
    "NO_COLOR",
    "FORCE_COLOR",
    "DATABASE_URL",
    "JWT_SECRET",
    "COOKIE_SECRET",
    "STORE_CORS",
    "ADMIN_CORS",
    "AUTH_CORS",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
    "NEXT_PUBLIC_DEFAULT_REGION",
    "MEDUSA_TELEMETRY_DISABLED",
    "NEXT_TELEMETRY_DISABLED",
  ]
  const environment = Object.fromEntries(
    allowedEnvironment
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  )
  const child = spawn(
    "bash",
    ["scripts/verify-application-builds.sh", "--browser"],
    {
      cwd: snapshot,
      env: { ...environment, APPLICATION_VERIFICATION_ISOLATED: "1" },
      stdio: "inherit",
    },
  )
  const interrupt = () => child.kill("SIGINT")
  const terminate = () => child.kill("SIGTERM")
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", terminate)
  result = await new Promise((done, fail) => {
    child.on("error", fail)
    child.on("close", (code) => done(code ?? 1))
  })
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", terminate)
} finally {
  for (const artifact of ["playwright-report", "test-results"]) {
    const destination = join(root, "apps/storefront", artifact)
    await rm(destination, { recursive: true, force: true })
    try {
      await cp(join(snapshot, "apps/storefront", artifact), destination, {
        recursive: true,
      })
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  await rm(snapshot, { recursive: true, force: true })
}
process.exitCode = result
