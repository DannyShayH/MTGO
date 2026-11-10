// Copies the root documents (GLOSSARY.md, the case in docs/case.md, the ADRs in docs/adr
// and module READMEs)
// into the docs site as generated pages. The repository file stays the only source.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, posix } from "node:path"

export interface CopyRootDocsOptions {
  /** The repository root, where GLOSSARY.md and docs/adr live */
  repoRoot: string
  /** The Starlight content folder (src/content/docs) */
  docsDir: string
  /** The site's base path, for example "/MTGO" */
  base: string
  /** The repository on GitHub, for links to files that are not on the site */
  repoUrl: string
  /** The architecture rules and their graph, shown on the dependency graph page */
  dependencyGraph?: DependencyGraph
}

export interface ArchitectureRule {
  name: string
  comment: string
}

export interface DependencyGraph {
  /** Mermaid output of the architecture rules (the root arch:graph script) */
  mermaid: string
  /** The forbidden rules in .dependency-cruiser.cjs */
  rules: ArchitectureRule[]
}

interface GeneratedPage {
  /** Path of the page inside docsDir, for example "architecture/glossary.md" */
  path: string
  /** Repository path of the copied document */
  source: string
  title: string
  body: string
}

/** Splits a Markdown file into its first level-one heading and the rest */
function splitTitle(markdown: string) {
  const match = markdown.match(/^\s*# (.+)\n+/)
  if (!match) {
    return { heading: undefined, body: markdown }
  }
  return { heading: match[1].trim(), body: markdown.slice(match[0].length) }
}

function readSource(repoRoot: string, source: string) {
  return splitTitle(readFileSync(join(repoRoot, source), "utf8"))
}

function collectPages(
  repoRoot: string,
  dependencyGraph?: DependencyGraph,
): GeneratedPage[] {
  const pages: GeneratedPage[] = []

  const glossary = readSource(repoRoot, "GLOSSARY.md")
  pages.push({
    path: "architecture/glossary.md",
    source: "GLOSSARY.md",
    title: "Glossary",
    body: glossary.body,
  })

  if (existsSync(join(repoRoot, "docs/case.md"))) {
    const theCase = readSource(repoRoot, "docs/case.md")
    pages.push({
      path: "product/case.md",
      source: "docs/case.md",
      title: theCase.heading ?? "MTOGO case",
      body: theCase.body,
    })
  }

  const adrDir = join(repoRoot, "docs/adr")
  const adrs = existsSync(adrDir)
    ? readdirSync(adrDir).filter((name) => /^\d{4}-.+\.md$/.test(name))
    : []
  for (const name of adrs.sort()) {
    const source = `docs/adr/${name}`
    const { heading, body } = readSource(repoRoot, source)
    const number = name.slice(0, 4)
    pages.push({
      path: `architecture/decisions/${name}`,
      source,
      title: `ADR-${number}: ${heading ?? name.slice(5, -3)}`,
      body,
    })
  }

  for (const source of findModuleReadmes(repoRoot)) {
    const { heading, body } = readSource(repoRoot, source)
    // apps/backend/src/modules/README.md -> backend-modules
    const name = posix
      .dirname(source)
      .split("/")
      .slice(1)
      .filter((segment) => segment !== "src")
      .join("-")
    pages.push({
      path: `architecture/modules/${name}.md`,
      source,
      title: heading ?? name,
      body,
    })
  }

  if (dependencyGraph) {
    pages.push(dependencyGraphPage(dependencyGraph))
  }

  return pages
}

/**
 * Removes the subgraphs that only wrap one other subgraph (apps > backend > src),
 * so the diagram starts at the first folder that holds more than one thing.
 */
function withoutWrappers(mermaid: string) {
  const lines = mermaid.split("\n")
  const isOpen = (line: string) => /^\s*subgraph\b/.test(line)
  const isEnd = (line: string) => /^\s*end\s*$/.test(line)
  const removed = new Set<number>()
  for (let open = 0; open < lines.length; open++) {
    if (!isOpen(lines[open])) {
      continue
    }
    // Find the matching end and count the direct children on the way
    let depth = 0
    let children = 0
    let firstChild = -1
    let close = open + 1
    for (; close < lines.length; close++) {
      const line = lines[close]
      if (depth === 0 && !isEnd(line) && line.trim()) {
        children++
        firstChild = firstChild === -1 ? close : firstChild
      }
      if (isOpen(line)) {
        depth++
      } else if (isEnd(line)) {
        if (depth === 0) {
          break
        }
        depth--
      }
    }
    if (children === 1 && isOpen(lines[firstChild])) {
      removed.add(open).add(close)
    }
  }
  return lines.filter((_, index) => !removed.has(index)).join("\n")
}

function dependencyGraphPage({
  mermaid,
  rules,
}: DependencyGraph): GeneratedPage {
  const diagram = withoutWrappers(mermaid).trimEnd()
  return {
    path: "architecture/dependency-graph.md",
    source: ".dependency-cruiser.cjs",
    title: "Dependency graph",
    body: [
      "How the folders in `apps/backend/src` import each other. An arrow from A to B means code in A imports code in B. A folder shows up once it holds code that imports or is imported, so layers that are still empty (such as workflows or modules) are not on the graph yet.",
      "",
      "The graph is generated from the architecture rules (the root `arch:graph` script) at every build of this site, so it always shows the code on `main`.",
      "",
      "```mermaid",
      diagram,
      "```",
      "",
      "## The rules",
      "",
      "The architecture rules in `.dependency-cruiser.cjs` run in the pre-commit hook and in the ready flow. A violation means the design is wrong: fix the code, never the rule.",
      "",
      ...rules.map((rule) => `- **\`${rule.name}\`**: ${rule.comment}`),
      "",
    ].join("\n"),
  }
}

/** Folders that never hold a module README: dependencies, build output and the docs app itself */
const skippedFolders = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
])

/** Repository paths of every README.md under apps/, except the docs app */
function findModuleReadmes(repoRoot: string) {
  const readmes: string[] = []
  const walk = (dir: string) => {
    const path = join(repoRoot, dir)
    if (!existsSync(path)) {
      return
    }
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith(".") &&
          !skippedFolders.has(entry.name) &&
          child !== "apps/docs"
        ) {
          walk(child)
        }
      } else if (entry.name === "README.md") {
        readmes.push(child)
      }
    }
  }
  walk("apps")
  return readmes.sort()
}

/** The page's URL on the site, for example "/MTGO/architecture/glossary/" */
function pageUrl(base: string, path: string) {
  return `${base}/${slugOf(path)}/`
}

// Inline links [text](target) and reference definitions [id]: target
const markdownLink = /(\]\(|^ {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]*>|[^)\s]+)/gm
const hasScheme = /^[a-z][a-z0-9+.-]*:/i

/**
 * Rewrites relative links so they work on the site: a link to another copied
 * document goes to its page, any other repository file goes to GitHub.
 */
function rewriteLinks(
  page: GeneratedPage,
  urlBySource: Map<string, string>,
  repoUrl: string,
) {
  const rewriteTarget = (target: string) => {
    if (
      hasScheme.test(target) ||
      target.startsWith("#") ||
      target.startsWith("/")
    ) {
      return target
    }
    const hashAt = target.indexOf("#")
    const path = hashAt === -1 ? target : target.slice(0, hashAt)
    const hash = hashAt === -1 ? "" : target.slice(hashAt)
    const resolved = posix.normalize(
      posix.join(posix.dirname(page.source), path),
    )
    if (resolved.startsWith("..")) {
      return target
    }
    const url = urlBySource.get(resolved)
    return url ? `${url}${hash}` : `${repoUrl}/blob/main/${resolved}${hash}`
  }

  // Code blocks are left as they are
  return page.body
    .split(/(^```[\s\S]*?^```$)/m)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(markdownLink, (_, open, target: string) =>
            target.startsWith("<") && target.endsWith(">")
              ? `${open}<${rewriteTarget(target.slice(1, -1))}>`
              : open + rewriteTarget(target),
          ),
    )
    .join("")
}

/** Marks a page as generated, so the next build may replace it but never a hand-written page */
const generatedMarker =
  "# Generated by apps/docs/scripts/copy-root-docs.ts. Do not edit."

function isGenerated(file: string) {
  return readFileSync(file, "utf8").startsWith(`---\n${generatedMarker}\n`)
}

/** The address of a content file: "a/b.md", "a/b.mdx" and "a/b/index.md" are all "a/b" */
function slugOf(path: string) {
  return path.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "")
}

/** Every Markdown file in docsDir, as paths inside docsDir */
function contentFiles(docsDir: string, dir = ""): string[] {
  return readdirSync(join(docsDir, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        return contentFiles(docsDir, path)
      }
      return /\.mdx?$/.test(entry.name) ? [path] : []
    },
  )
}

function render(page: GeneratedPage, body: string, repoUrl: string) {
  return [
    "---",
    generatedMarker,
    `# Source: ${page.source}`,
    `title: ${JSON.stringify(page.title)}`,
    `editUrl: ${JSON.stringify(`${repoUrl}/edit/main/${page.source}`)}`,
    "---",
    "",
    body,
  ].join("\n")
}

/** Thrown before anything is written, when the generated pages cannot be written safely */
export class RootDocsClashError extends Error {
  constructor(problems: string[], advice: string) {
    super(
      [
        "Copying the root documents failed. Nothing was copied.",
        ...problems.map((problem) => `  ${problem}`),
        advice,
      ].join("\n"),
    )
    this.name = "RootDocsClashError"
  }
}

function findClashes(pages: GeneratedPage[], docsDir: string) {
  const sourcesByPath = Map.groupBy(pages, (page) => page.path)
  const duplicates = [...sourcesByPath]
    .filter(([, group]) => group.length > 1)
    .map(
      ([path, group]) =>
        `${group.map((page) => page.source).join(" and ")} would both be copied to ${path}`,
    )
  if (duplicates.length) {
    throw new RootDocsClashError(
      duplicates,
      "Rename one of the folders, or change how copy-root-docs names module pages.",
    )
  }

  const pageBySlug = new Map(pages.map((page) => [slugOf(page.path), page]))
  const handWritten = contentFiles(docsDir).flatMap((path) => {
    const page = pageBySlug.get(slugOf(path))
    return page && !isGenerated(join(docsDir, path))
      ? [
          `${path} is a hand-written page, but ${page.source} would be copied to the same address`,
        ]
      : []
  })
  if (handWritten.length) {
    throw new RootDocsClashError(
      handWritten,
      `Rename or move the hand-written page in ${docsDir}.`,
    )
  }
}

/**
 * Writes the generated pages and returns their paths inside docsDir.
 * Pages generated by an earlier run are replaced or removed. A hand-written page
 * at the address of a generated page, or two sources for one page, throw
 * RootDocsClashError before anything is written.
 */
export function copyRootDocs(options: CopyRootDocsOptions): string[] {
  const { repoRoot, docsDir, base, repoUrl, dependencyGraph } = options
  const pages = collectPages(repoRoot, dependencyGraph)

  findClashes(pages, docsDir)

  for (const path of contentFiles(docsDir)) {
    if (isGenerated(join(docsDir, path))) {
      rmSync(join(docsDir, path))
    }
  }

  const urlBySource = new Map(
    pages.map((page) => [page.source, pageUrl(base, page.path)]),
  )
  for (const page of pages) {
    const file = join(docsDir, page.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      render(page, rewriteLinks(page, urlBySource, repoUrl), repoUrl),
    )
  }
  return pages.map((page) => page.path)
}
