import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { copyRootDocs } from "./root-docs.ts"

const repoUrl = "https://github.com/example/repo"

let repoRoot: string
let docsDir: string

function write(path: string, content: string) {
  const file = join(repoRoot, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function page(path: string) {
  return readFileSync(join(docsDir, path), "utf8")
}

function copy() {
  return copyRootDocs({ repoRoot, docsDir, base: "/MTGO", repoUrl })
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "root-docs-"))
  docsDir = join(repoRoot, "apps/docs/src/content/docs")
  mkdirSync(docsDir, { recursive: true })
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

describe("copyRootDocs", () => {
  it("copies the glossary into the site as a page with a title", () => {
    write("GLOSSARY.md", "# MTOGO\n\n**Work item**:\nAn issue.\n")

    copy()

    const glossary = page("architecture/glossary.md")
    expect(glossary).toContain(`\ntitle: "Glossary"\n`)
    expect(glossary).toContain("**Work item**:\nAn issue.")
    expect(glossary).not.toContain("# MTOGO")
  })

  it("copies the case into the product section when docs/case.md exists", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write("docs/case.md", "# MTOGO case\n\n## Scenario\n\nFood delivery.\n")

    const paths = copy()

    expect(paths).toContain("product/case.md")
    const theCase = page("product/case.md")
    expect(theCase).toContain(`\ntitle: "MTOGO case"\n`)
    expect(theCase).toContain("# Source: docs/case.md")
    expect(theCase).toContain("## Scenario\n\nFood delivery.")
  })

  it("leaves out the case page when docs/case.md does not exist", () => {
    write("GLOSSARY.md", "# MTOGO\n")

    expect(copy()).not.toContain("product/case.md")
  })

  it("copies every ADR and rewrites a link to another ADR to its page on the site", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write("docs/adr/0001-use-vitest.md", "# Use Vitest\n\nWe use Vitest.\n")
    write(
      "docs/adr/0002-timeline.md",
      "# Status from the timeline\n\nSee [the Vitest decision](./0001-use-vitest.md#considered-options).\n",
    )

    copy()

    expect(page("architecture/decisions/0001-use-vitest.md")).toContain(
      `\ntitle: "ADR-0001: Use Vitest"\n`,
    )
    expect(page("architecture/decisions/0002-timeline.md")).toContain(
      "See [the Vitest decision](/MTGO/architecture/decisions/0001-use-vitest/#considered-options).",
    )
  })

  it("copies module READMEs and points links to files outside the site at GitHub", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write(
      "apps/backend/README.md",
      "# Backend\n\nCommands are in [`AGENTS.md`](../../AGENTS.md) and [modules](src/modules/README.md).\n",
    )
    write(
      "apps/backend/src/modules/README.md",
      "# Custom Module\n\nSee [Medusa](https://docs.medusajs.com).\n\n```ts\nconst link = [a](./b.md)\n```\n",
    )
    write("apps/backend/node_modules/some-package/README.md", "# Not ours\n")
    write("apps/docs/README.md", "# The docs app itself\n")

    const written = copy()

    expect(
      written.filter((path) => path.startsWith("architecture/modules/")).sort(),
    ).toEqual([
      "architecture/modules/backend-modules.md",
      "architecture/modules/backend.md",
    ])
    expect(page("architecture/modules/backend.md")).toContain(
      `Commands are in [\`AGENTS.md\`](${repoUrl}/blob/main/AGENTS.md) and [modules](/MTGO/architecture/modules/backend-modules/).`,
    )
    const modules = page("architecture/modules/backend-modules.md")
    expect(modules).toContain(`\ntitle: "Custom Module"\n`)
    expect(modules).toContain("See [Medusa](https://docs.medusajs.com).")
    expect(modules).toContain("const link = [a](./b.md)")
  })

  it("fails on a hand-written page with the same path and leaves it unchanged", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write("docs/adr/0001-use-vitest.md", "# Use Vitest\n")
    const handWritten = "---\ntitle: My decision\n---\n\nWritten by hand.\n"
    mkdirSync(join(docsDir, "architecture/decisions"), { recursive: true })
    writeFileSync(
      join(docsDir, "architecture/decisions/0001-use-vitest.md"),
      handWritten,
    )

    expect(copy).toThrow(
      "architecture/decisions/0001-use-vitest.md is a hand-written page, but docs/adr/0001-use-vitest.md would be copied to the same address",
    )
    expect(page("architecture/decisions/0001-use-vitest.md")).toBe(handWritten)
  })

  it("replaces its own pages from an earlier build and removes pages whose source is gone", () => {
    write("GLOSSARY.md", "# MTOGO\n\nFirst version.\n")
    write("docs/adr/0001-use-vitest.md", "# Use Vitest\n")
    copy()
    rmSync(join(repoRoot, "docs/adr/0001-use-vitest.md"))
    write("GLOSSARY.md", "# MTOGO\n\nSecond version.\n")

    copy()

    expect(page("architecture/glossary.md")).toContain("Second version.")
    expect(() => page("architecture/decisions/0001-use-vitest.md")).toThrow(
      /ENOENT/,
    )
  })

  it("embeds the dependency graph without the folders that only wrap one other folder", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    const mermaid = [
      "flowchart LR",
      "",
      'subgraph 0["apps"]',
      'subgraph 1["backend"]',
      'subgraph 2["src"]',
      '3["api"]',
      '4["workflows"]',
      "end",
      "end",
      "end",
      "3-->4",
      "",
    ].join("\n")

    copyRootDocs({
      repoRoot,
      docsDir,
      base: "/MTGO",
      repoUrl,
      dependencyGraph: { mermaid, rules: [] },
    })

    const graph = page("architecture/dependency-graph.md")
    expect(graph).toContain(`\ntitle: "Dependency graph"\n`)
    expect(graph).toContain(
      [
        "```mermaid",
        "flowchart LR",
        "",
        'subgraph 2["src"]',
        '3["api"]',
        '4["workflows"]',
        "end",
        "3-->4",
        "```",
      ].join("\n"),
    )
  })

  it("lists the architecture rules under the dependency graph", () => {
    write("GLOSSARY.md", "# MTOGO\n")

    copyRootDocs({
      repoRoot,
      docsDir,
      base: "/MTGO",
      repoUrl,
      dependencyGraph: {
        mermaid: "flowchart LR\n",
        rules: [
          {
            name: "workflows-not-to-api",
            comment: "Workflows must not depend on the HTTP layer.",
          },
        ],
      },
    })

    expect(page("architecture/dependency-graph.md")).toContain(
      "- **`workflows-not-to-api`**: Workflows must not depend on the HTTP layer.",
    )
  })

  it("fails on a hand-written page that would get the same address in another form", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    const handWritten = "---\ntitle: Glossary\n---\n\nWritten by hand.\n"
    mkdirSync(join(docsDir, "architecture/glossary"), { recursive: true })
    writeFileSync(join(docsDir, "architecture/glossary/index.mdx"), handWritten)

    expect(copy).toThrow(
      "architecture/glossary/index.mdx is a hand-written page, but GLOSSARY.md would be copied to the same address",
    )
    expect(page("architecture/glossary/index.mdx")).toBe(handWritten)
  })

  it("fails when two module READMEs would get the same page", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write("apps/backend/jobs/README.md", "# Jobs\n")
    write("apps/backend/src/jobs/README.md", "# Jobs in src\n")

    expect(copy).toThrow(
      "apps/backend/jobs/README.md and apps/backend/src/jobs/README.md would both be copied to architecture/modules/backend-jobs.md",
    )
  })

  it("rewrites reference-style links between copied documents", () => {
    write(
      "GLOSSARY.md",
      "# MTOGO\n\nSee [the decision][adr].\n\n[adr]: docs/adr/0001-use-vitest.md\n",
    )
    write("docs/adr/0001-use-vitest.md", "# Use Vitest\n")

    copy()

    expect(page("architecture/glossary.md")).toContain(
      "[adr]: /MTGO/architecture/decisions/0001-use-vitest/",
    )
  })

  it("rewrites angle-bracket destinations in inline and reference links", () => {
    write("GLOSSARY.md", "# MTOGO\n")
    write("docs/adr/0001-use-vitest.md", "# Use Vitest\n")
    write(
      "docs/adr/0002-timeline.md",
      "# Timeline\n\n[Decision](<./0001-use-vitest.md#options>)\n\n[adr]: <./0001-use-vitest.md>\n\n[External](<https://example.com>)\n",
    )

    copy()

    const decision = page("architecture/decisions/0002-timeline.md")
    expect(decision).toContain(
      "[Decision](</MTGO/architecture/decisions/0001-use-vitest/#options>)",
    )
    expect(decision).toContain(
      "[adr]: </MTGO/architecture/decisions/0001-use-vitest/>",
    )
    expect(decision).toContain("[External](<https://example.com>)")
  })
})
