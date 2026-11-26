import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseRatingsPeriod, ratingsHref } from "../ratings-period.ts"

describe("reading the Ratings page address", () => {
  it("defaults to the last 30 days", () => {
    assert.equal(parseRatingsPeriod({}), "last_30_days")
  })

  it("keeps a known period", () => {
    assert.equal(
      parseRatingsPeriod({ period: "previous_month" }),
      "previous_month",
    )
    assert.equal(parseRatingsPeriod({ period: "all_time" }), "all_time")
  })

  it("falls back on an unknown or repeated period", () => {
    assert.equal(parseRatingsPeriod({ period: "last_week" }), "last_30_days")
    assert.equal(
      parseRatingsPeriod({ period: ["all_time", "previous_month"] }),
      "last_30_days",
    )
  })

  it("links the default period without a query", () => {
    assert.equal(ratingsHref("last_30_days"), "/ratings")
    assert.equal(ratingsHref("all_time"), "/ratings?period=all_time")
  })
})
