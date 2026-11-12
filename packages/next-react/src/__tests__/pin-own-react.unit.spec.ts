import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { pinOwnReact } = require("../pin-own-react.cjs")

// The repository layout from #82: React 18 hoisted to the root for Medusa
// Admin, React 19 inside the Next.js app, and a dependency hoisted to the root
// that imports React.
const root = mkdtempSync(join(tmpdir(), "next-react-"))
after(() => rmSync(root, { recursive: true, force: true }))

const createFakePackage = (
  dir: string,
  name: string,
  version: string,
  files: string[],
) => {
  const packageDir = join(dir, "node_modules", name)
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({ name, version }),
  )
  for (const file of files) {
    writeFileSync(
      join(packageDir, file),
      `module.exports = "${name}@${version}/${file}"`,
    )
  }
}
createFakePackage(root, "react", "18.3.1", ["index.js", "jsx-runtime.js"])
createFakePackage(root, "react-dom", "18.3.1", ["index.js", "server.js"])
createFakePackage(root, "react-is", "18.3.1", ["index.js"])
createFakePackage(root, "clsx", "2.1.1", ["index.js"])
const app = join(root, "apps", "storefront")
createFakePackage(app, "react", "19.0.5", ["index.js", "jsx-runtime.js"])
createFakePackage(app, "react-dom", "19.0.5", ["index.js", "server.js"])
writeFileSync(join(app, "package.json"), "{}")
const hoisted = join(root, "node_modules", "@medusajs", "icons")
mkdirSync(hoisted, { recursive: true })
const requireFromHoisted = createRequire(join(hoisted, "index.js"))

pinOwnReact(app)

// Which requests from a hoisted dependency go to the app's copy.
const cases = [
  {
    reason: "EP: react comes from the app, not the root",
    request: "react",
    expected: "react@19.0.5/index.js",
  },
  {
    reason: "EP: react subpaths come from the app",
    request: "react/jsx-runtime",
    expected: "react@19.0.5/jsx-runtime.js",
  },
  {
    reason: "EP: react-dom subpaths come from the app",
    request: "react-dom/server",
    expected: "react-dom@19.0.5/server.js",
  },
  {
    reason: "EP: a package that only starts with react resolves as usual",
    request: "react-is",
    expected: "react-is@18.3.1/index.js",
  },
  {
    reason: "EP: other packages resolve as usual",
    request: "clsx",
    expected: "clsx@2.1.1/index.js",
  },
]

for (const { reason, request, expected } of cases) {
  test(reason, () => {
    assert.equal(requireFromHoisted(request), expected)
  })
}
