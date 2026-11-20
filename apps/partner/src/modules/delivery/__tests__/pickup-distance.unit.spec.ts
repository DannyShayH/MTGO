import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatDistance,
  RESEND_AFTER_MS,
  shouldSendPosition,
  sortByNearest,
} from "../pickup-distance.ts"

describe("formatDistance", () => {
  it("shows an approximate distance to 0.1 km in each language", () => {
    assert.equal(formatDistance(3.2, "da"), "≈ 3,2 km")
    assert.equal(formatDistance(3.2, "en"), "≈ 3.2 km")
    assert.equal(formatDistance(12, "en"), "≈ 12.0 km")
    assert.equal(formatDistance(0, "da"), "≈ 0,0 km")
  })

  it("has no text without a distance, so the caller says it is unavailable", () => {
    assert.equal(formatDistance(null, "da"), null)
    assert.equal(formatDistance(undefined, "en"), null)
  })
})

describe("sortByNearest", () => {
  // Oldest acceptance first, as the backend lists them.
  const oldestFirst = [
    { order_id: "a" },
    { order_id: "b" },
    { order_id: "c" },
    { order_id: "d" },
  ]

  it("puts the nearest pickups first and the unmeasured ones after, oldest first", () => {
    const sorted = sortByNearest(oldestFirst, {
      a: 2.4,
      b: null,
      c: 0.8,
      d: 2.4,
    })
    assert.deepEqual(
      sorted.map(({ order_id }) => order_id),
      ["c", "a", "d", "b"],
    )
  })

  it("keeps the oldest-first order without distances and leaves the list untouched", () => {
    const sorted = sortByNearest(oldestFirst, {})
    assert.deepEqual(
      sorted.map(({ order_id }) => order_id),
      ["a", "b", "c", "d"],
    )
    assert.notEqual(sorted, oldestFirst)
  })
})

describe("shouldSendPosition", () => {
  const here = { latitude: 55.6761, longitude: 12.5683 }
  const now = 1_000_000
  // Due north: one degree of latitude is about 111,195 m.
  const north = (meters: number) => ({
    latitude: here.latitude + meters / 111_195,
    longitude: here.longitude,
  })
  const last = { position: here, at: now }

  const cases = [
    {
      reason: "EP: the first position is always sent",
      last: null,
      next: here,
      after: 0,
      send: true,
    },
    {
      reason: "BVA: 199 m within the minute is not resent",
      last,
      next: north(199),
      after: 1_000,
      send: false,
    },
    {
      reason: "BVA: 201 m within the minute is resent",
      last,
      next: north(201),
      after: 1_000,
      send: true,
    },
    {
      reason: "BVA: 1 ms before the minute, unmoved, is not resent",
      last,
      next: here,
      after: RESEND_AFTER_MS - 1,
      send: false,
    },
    {
      reason: "BVA: exactly the minute, unmoved, is resent",
      last,
      next: here,
      after: RESEND_AFTER_MS,
      send: true,
    },
  ]
  for (const { reason, last, next, after, send } of cases)
    it(reason, () => {
      assert.equal(shouldSendPosition(last, next, now + after), send)
    })
})
