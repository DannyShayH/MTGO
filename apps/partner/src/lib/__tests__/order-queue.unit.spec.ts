import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  hasFilters,
  withoutFilters,
  orderSearch,
  parseQueueQuery,
  placementWindow,
  queueHref,
} from "../order-queue.ts"

/** 12:00 UTC on Monday 23 November 2026 is 13:00 in Copenhagen (CET). */
const NOW = new Date("2026-11-23T12:00:00.000Z")

describe("reading the Orders page address", () => {
  it("EP: an empty address is the first page of Awaiting acceptance without filters", () => {
    assert.deepEqual(parseQueueQuery({}), { view: "awaiting", page: 1 })
  })

  it("EP: History keeps its search, period and reason", () => {
    assert.deepEqual(
      parseQueueQuery({
        view: "history",
        page: "2",
        q: "#1042",
        period: "7d",
        cancellation_category: "acceptance_timeout",
      }),
      {
        view: "history",
        page: 2,
        q: "1042",
        period: "7d",
        cancellation_category: "acceptance_timeout",
      },
    )
  })

  it("EP: only History is narrowed by period and reason; every view can search", () => {
    assert.deepEqual(
      parseQueueQuery({
        view: "active",
        q: "7",
        period: "today",
        cancellation_category: "restaurant_rejected",
      }),
      { view: "active", page: 1, q: "7" },
    )
  })

  it("EP: unknown values are dropped instead of failing the page", () => {
    assert.deepEqual(
      parseQueueQuery({
        view: "everything",
        page: "-3",
        period: "forever",
        cancellation_category: "lost",
      }),
      { view: "awaiting", page: 1 },
    )
  })

  it("EP: a custom period keeps only real calendar dates", () => {
    assert.deepEqual(
      parseQueueQuery({
        view: "history",
        period: "custom",
        from: "2026-11-01",
        to: "2026-02-30",
      }),
      { view: "history", page: 1, period: "custom", from: "2026-11-01" },
    )
  })
})

describe("what staff typed in the search", () => {
  it("EP: the number with or without # and spaces", () => {
    assert.deepEqual(orderSearch(" #1042 "), { q: "1042" })
    assert.deepEqual(orderSearch("1042"), { q: "1042" })
  })

  it("EP: an empty search clears the filter", () => {
    assert.deepEqual(orderSearch("  "), { q: undefined })
  })

  it("EP: anything else is not a number to search for", () => {
    assert.equal(orderSearch("Margherita"), "invalid")
    assert.equal(orderSearch("12a"), "invalid")
  })

  it("BVA: nine digits is the longest Order number", () => {
    assert.deepEqual(orderSearch("123456789"), { q: "123456789" })
    assert.equal(orderSearch("1234567890"), "invalid")
  })
})

describe("the placement window on the Restaurant's Copenhagen days", () => {
  it("EP: no period means no window", () => {
    assert.deepEqual(placementWindow({ view: "history", page: 1 }, NOW), {})
  })

  it("EP: today runs from Copenhagen midnight to the next", () => {
    assert.deepEqual(
      placementWindow({ view: "history", page: 1, period: "today" }, NOW),
      {
        placed_from: "2026-11-22T23:00:00.000Z",
        placed_to: "2026-11-23T23:00:00.000Z",
      },
    )
  })

  it("EP: yesterday is the whole day before", () => {
    assert.deepEqual(
      placementWindow({ view: "history", page: 1, period: "yesterday" }, NOW),
      {
        placed_from: "2026-11-21T23:00:00.000Z",
        placed_to: "2026-11-22T23:00:00.000Z",
      },
    )
  })

  it("EP: the last 7 days include today", () => {
    assert.deepEqual(
      placementWindow({ view: "history", page: 1, period: "7d" }, NOW),
      {
        placed_from: "2026-11-16T23:00:00.000Z",
        placed_to: "2026-11-23T23:00:00.000Z",
      },
    )
  })

  it("BVA: shortly after midnight in Copenhagen it is already the next day", () => {
    const justAfter = new Date("2026-11-23T23:00:00.000Z")
    assert.deepEqual(
      placementWindow({ view: "history", page: 1, period: "today" }, justAfter),
      {
        placed_from: "2026-11-23T23:00:00.000Z",
        placed_to: "2026-11-24T23:00:00.000Z",
      },
    )
  })

  it("BVA: a custom range across the switch to summer time keeps local midnights", () => {
    assert.deepEqual(
      placementWindow(
        {
          view: "history",
          page: 1,
          period: "custom",
          from: "2026-03-28",
          to: "2026-03-29",
        },
        NOW,
      ),
      {
        placed_from: "2026-03-27T23:00:00.000Z",
        placed_to: "2026-03-29T22:00:00.000Z",
      },
    )
  })

  it("EP: a custom range with only one date is open at the other end", () => {
    assert.deepEqual(
      placementWindow(
        { view: "history", page: 1, period: "custom", to: "2026-11-01" },
        NOW,
      ),
      { placed_to: "2026-11-01T23:00:00.000Z" },
    )
  })

  it("BVA: an end date before the start date is refused, the same day is not", () => {
    const custom = {
      view: "history" as const,
      page: 1,
      period: "custom" as const,
    }
    assert.equal(
      placementWindow({ ...custom, from: "2026-11-02", to: "2026-11-01" }, NOW),
      "invalid",
    )
    assert.notEqual(
      placementWindow({ ...custom, from: "2026-11-02", to: "2026-11-02" }, NOW),
      "invalid",
    )
  })
})

describe("links between views, pages and filters", () => {
  const filtered = {
    view: "history" as const,
    page: 3,
    q: "42",
    period: "custom" as const,
    from: "2026-11-01",
    cancellation_category: "customer_cancelled" as const,
  }

  it("EP: the default view and first page leave the address short", () => {
    assert.equal(
      queueHref({ view: "awaiting", page: 1 }),
      "/orders?view=awaiting",
    )
  })

  it("EP: changing a filter goes back to the first page", () => {
    assert.equal(
      queueHref(filtered, { cancellation_category: undefined }),
      "/orders?view=history&q=42&period=custom&from=2026-11-01",
    )
  })

  it("EP: paging keeps the filters", () => {
    assert.equal(
      queueHref(filtered, { page: 4 }),
      "/orders?view=history&page=4&q=42&period=custom&from=2026-11-01&cancellation_category=customer_cancelled",
    )
  })

  it("EP: leaving a custom period drops its dates", () => {
    assert.equal(
      queueHref(filtered, { period: "today" }),
      "/orders?view=history&q=42&period=today&cancellation_category=customer_cancelled",
    )
  })

  it("EP: clearing the filters keeps the view and goes back to the first page", () => {
    assert.equal(withoutFilters(filtered), "/orders?view=history")
  })

  it("EP: only search, period or reason count as filters", () => {
    assert.equal(hasFilters({ view: "history", page: 4 }), false)
    assert.equal(hasFilters(filtered), true)
  })
})
