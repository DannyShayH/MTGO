import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isSharedFetch } from "../shared-fetch.ts"

// Next.js keys its data cache on the request headers, so a request ID on a
// shared fetch would give every visitor their own cache entry.
describe("isSharedFetch", () => {
  const examples: {
    reason: string
    init: Parameters<typeof isSharedFetch>[0]
    shared: boolean
  }[] = [
    { reason: "EP: no options", init: undefined, shared: false },
    { reason: "EP: no-store", init: { cache: "no-store" }, shared: false },
    { reason: "EP: force-cache", init: { cache: "force-cache" }, shared: true },
    {
      reason: "EP: a tag alone does not cache",
      init: { next: { tags: ["carts-1"] } },
      shared: false,
    },
    {
      reason: "BVA: revalidate 0 is never cached",
      init: { next: { revalidate: 0 } },
      shared: false,
    },
    {
      reason: "BVA: revalidate 1 second",
      init: { next: { revalidate: 1 } },
      shared: true,
    },
    {
      reason: "EP: revalidate false caches without end",
      init: { next: { revalidate: false } },
      shared: true,
    },
  ]
  for (const { reason, init, shared } of examples)
    it(reason, () => assert.equal(isSharedFetch(init), shared))
})
