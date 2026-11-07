// Fails when a built HTML file has an internal href/src that starts with "/" but not with the base.
// GitHub Pages serves the site under /MTGO/, so such a link is broken on the live site.
// Taken from the course template kea-dev/kanban-starlight. The base is the one astro.config.mjs builds with.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../astro.config.mjs"

const distDir = fileURLToPath(new URL("../dist", import.meta.url))
// astro.config.mjs already reads BASE_PATH (from configure-pages in CI) and falls back to /MTGO
const base = (config.base ?? "").replace(/\/+$/, "")

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* htmlFiles(path)
    } else if (entry.name.endsWith(".html")) {
      yield path
    }
  }
}

const attr = /\s(?:href|src)=["'](\/[^"']*)["']/g
const problems = []
for (const file of htmlFiles(distDir)) {
  const html = readFileSync(file, "utf8")
  for (const [, url] of html.matchAll(attr)) {
    if (url.startsWith("//") || !base) {
      continue
    }
    if (url === base || url.startsWith(`${base}/`)) {
      continue
    }
    problems.push(`${file}: ${url}`)
  }
}

if (problems.length) {
  console.error(
    `Internal links missing base "${base}":\n${problems.join("\n")}`,
  )
  process.exit(1)
}
console.log(`All internal links include base "${base}".`)
