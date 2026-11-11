import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Exercise Medusa's actual development bundler without starting a database or API.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const backend = resolve(root, "apps/backend")
const requireBackend = createRequire(resolve(backend, "package.json"))
const { develop } = requireBackend("@medusajs/admin-bundler")
const { getConfigFile } = requireBackend("@medusajs/framework/utils")
process.chdir(backend)
process.env.NODE_ENV = "development"
requireBackend("ts-node").register({
  project: resolve(backend, "tsconfig.json"),
  transpileOnly: true,
  swc: true,
})

let viteServer
await mkdir(resolve(root, "tmp"), { recursive: true })
const workspace = await mkdtemp(resolve(root, "tmp/admin-development-"))
await symlink(
  resolve(backend, "node_modules"),
  resolve(workspace, "node_modules"),
  "dir",
)
try {
  const { configModule, error } = await getConfigFile(backend, "medusa-config")
  if (error) throw error
  process.chdir(workspace)
  await develop({
    path: "/app",
    outDir: resolve(workspace, ".medusa/admin"),
    sources: [resolve(backend, "src/admin")],
    plugins: [],
    vite: (base) => {
      const override = configModule.admin.vite(base)
      return {
        ...override,
        cacheDir: resolve(workspace, "vite-cache"),
        plugins: [
          {
            name: "verify-admin-development-lifecycle",
            // Keep this check at the source-transform seam. Production browser
            // verification covers dependency bundling and application behavior.
            configResolved(config) {
              config.optimizeDeps.include = []
              config.optimizeDeps.noDiscovery = true
            },
            configureServer(server) {
              viteServer = server
            },
          },
          ...(override.plugins || []),
        ],
      }
    },
  })
  for (const file of [
    "routes/restaurants/page.tsx",
    "routes/restaurants/[id]/page.tsx",
  ]) {
    const result = await viteServer.transformRequest(
      `/@fs${resolve(backend, "src/admin", file)}`,
    )
    assert(
      result?.code.includes("$RefreshReg$"),
      `${file} must compile with React Refresh enabled`,
    )
  }
} finally {
  await viteServer?.close()
  process.chdir(root)
  await rm(workspace, { recursive: true, force: true })
}

// Medusa's development bundler can retain process handles after Vite closes.
// This standalone check owns its process; exit only after assertions and cleanup.
process.stdout.write(
  "Admin development: Restaurant pages compile without refresh errors.\n",
  () => process.exit(0),
)
