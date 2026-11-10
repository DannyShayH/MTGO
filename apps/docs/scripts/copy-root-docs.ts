// Runs before every dev, check and build of the docs site: copies GLOSSARY.md, the case, the ADRs
// and module READMEs into src/content/docs, and generates the dependency graph page.
// The generated pages are git-ignored. See root-docs.ts for the rules.
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import config, { repo } from "../astro.config.mjs"
import { copyRootDocs, RootDocsClashError } from "./root-docs.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const docsDir = fileURLToPath(new URL("../src/content/docs", import.meta.url))
// astro.config.mjs reads BASE_PATH (from configure-pages in CI) and falls back to /MTGO
const base = (config.base ?? "").replace(/\/+$/, "")

// The architecture rules' own Mermaid output, so the graph is the one `<pm> run arch:graph` prints.
// Run with the package manager that started this script (npm_execpath), never an assumed one.
const packageManager = process.env.npm_execpath
const mermaid = execFileSync(
  packageManager ? process.execPath : "npm",
  [
    ...(packageManager ? [packageManager] : []),
    "run",
    "--silent",
    "arch:graph",
  ],
  { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
)

// The forbidden rules, with the comment that explains each one
const { forbidden } = createRequire(import.meta.url)(
  `${repoRoot}/.dependency-cruiser.cjs`,
) as { forbidden: { name: string; comment: string }[] }
const dependencyGraph = {
  mermaid,
  rules: forbidden.map(({ name, comment }) => ({ name, comment })),
}

try {
  const pages = copyRootDocs({
    repoRoot,
    docsDir,
    base,
    repoUrl: repo,
    dependencyGraph,
  })
  console.log(`Generated ${pages.length} pages from the root documents.`)
} catch (error) {
  if (error instanceof RootDocsClashError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
