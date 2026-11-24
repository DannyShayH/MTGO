import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { recentlyCancelled } from "../cancelled-notice.ts"

const now = new Date("2026-11-24T12:30:00.000Z")
const ended = (outcome: "delivered" | "cancelled" | "failed", at: string) => ({
  outcome,
  ended_at: at,
})

describe("The cancelled-delivery notice (#199)", () => {
  for (const { entry, shown, reason } of [
    {
      entry: ended("cancelled", "2026-11-24T12:29:00.000Z"),
      shown: true,
      reason: "EP: cancelled a minute ago",
    },
    {
      entry: ended("cancelled", "2026-11-24T12:00:00.001Z"),
      shown: true,
      reason: "BVA: 1 ms inside thirty minutes",
    },
    {
      entry: ended("cancelled", "2026-11-24T12:00:00.000Z"),
      shown: false,
      reason: "BVA: exactly thirty minutes ago",
    },
    {
      entry: ended("delivered", "2026-11-24T12:29:00.000Z"),
      shown: false,
      reason: "EP: the newest delivery was handed over",
    },
    {
      entry: ended("cancelled", "2026-11-24T12:30:00.001Z"),
      shown: false,
      reason: "BVA: 1 ms in the future, a clock the server disagrees with",
    },
    { entry: null, shown: false, reason: "EP: no ended delivery" },
  ])
    it(`${shown ? "shows" : "hides"} the notice (${reason})`, () => {
      assert.equal(recentlyCancelled(entry, now), shown ? entry : null)
    })
})
