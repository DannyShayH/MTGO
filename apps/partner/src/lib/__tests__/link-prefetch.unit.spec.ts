import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const SOURCE = join(import.meta.dirname, "..", "..")

/**
 * Every partner page is dynamic and reads the signed-in staff member or agent
 * from the backend. A prefetched link renders its page on the server, and
 * every `router.refresh()` after an action prefetches all visible links
 * again: one kitchen click caused about 30 page renders (#253). So links
 * navigate on click only.
 */
describe("partner app links", () => {
  it("never prefetch, so a refresh does not render every linked page", () => {
    const files = readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => !file.includes("__tests__"))
    const prefetching = files.flatMap((file) => {
      const source = readFileSync(join(SOURCE, file), "utf8")
      // A tag runs to its first ">" that is not part of an arrow "=>".
      const links = source.match(/<Link(?=\s)(?:=>|[^>])*/g) ?? []
      return links
        .filter((link) => !/\bprefetch=\{false\}/.test(link))
        .map(() => file)
    })

    assert.ok(files.length > 0, "the scan found the app's source files")
    assert.deepEqual(prefetching, [])
  })
})
