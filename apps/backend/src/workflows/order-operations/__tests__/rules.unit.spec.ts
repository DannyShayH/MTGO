import { acceptanceDeadline, acceptanceWindow, queueView } from "../rules"

const placedAt = new Date("2026-11-18T12:00:00.000Z")
const deadline = new Date("2026-11-18T12:05:00.000Z")

describe("Order acceptance deadline", () => {
  it("is five minutes after paid placement", () => {
    expect(acceptanceDeadline(placedAt)).toEqual(deadline)
  })

  it.each([
    {
      now: "2026-11-18T12:00:00.000Z",
      expected: "open",
      reason: "EP: inside the window, at placement",
    },
    {
      now: "2026-11-18T12:04:59.999Z",
      expected: "open",
      reason: "BVA: 1 ms before the deadline",
    },
    {
      now: "2026-11-18T12:05:00.000Z",
      expected: "elapsed",
      reason: "BVA: exactly at the deadline is too late",
    },
    {
      now: "2026-11-18T12:05:00.001Z",
      expected: "elapsed",
      reason: "BVA: 1 ms after the deadline",
    },
  ])("$reason: $expected", ({ now, expected }) => {
    expect(acceptanceWindow(deadline, new Date(now))).toBe(expected)
  })

  it("is unavailable for a legacy Order without recorded placement timing", () => {
    expect(acceptanceWindow(null, new Date("2026-11-18T12:00:00.000Z"))).toBe(
      "unavailable",
    )
  })
})

describe("Restaurant Orders queue views", () => {
  it.each([
    {
      view: "awaiting" as const,
      states: ["awaiting_acceptance"],
      order: { acceptance_deadline: "ASC", id: "ASC" },
      reason: "EP: earliest deadline first, with a stable tie-breaker",
    },
    {
      view: "active" as const,
      states: ["accepted", "preparing", "ready"],
      order: { placed_at: "ASC", id: "ASC" },
      reason: "EP: active kitchen work, oldest first",
    },
    {
      view: "history" as const,
      states: ["cancelled"],
      order: { placed_at: "DESC", id: "DESC" },
      reason: "EP: terminal Orders, newest first",
    },
  ])("$view holds $states: $reason", ({ view, states, order }) => {
    expect(queueView(view)).toEqual({ states, order })
  })
})
