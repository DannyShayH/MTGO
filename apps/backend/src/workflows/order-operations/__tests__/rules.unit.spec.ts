import {
  acceptanceDeadline,
  acceptanceWindow,
  availableActions,
  decideAcceptance,
  queueView,
} from "../rules"

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

describe("Accepting an Order", () => {
  const awaiting = {
    state: "awaiting_acceptance" as const,
    acceptance_deadline: deadline,
    accepted_at: null,
  }
  const acceptedAt = new Date("2026-11-18T12:02:00.000Z")

  it.each([
    {
      order: awaiting,
      now: "2026-11-18T12:04:59.999Z",
      expected: { outcome: "accept" },
      reason: "BVA: awaiting, 1 ms before the deadline",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.000Z",
      expected: { outcome: "refused", code: "acceptance_window_elapsed" },
      reason: "BVA: awaiting, exactly at the deadline (18:05:00 for 18:00:00)",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.001Z",
      expected: { outcome: "refused", code: "acceptance_window_elapsed" },
      reason: "BVA: awaiting, 1 ms after the deadline",
    },
    {
      order: { ...awaiting, acceptance_deadline: null },
      now: "2026-11-18T12:00:00.000Z",
      expected: { outcome: "refused", code: "acceptance_timing_unavailable" },
      reason: "DT: a legacy Order without a deadline gets no invented window",
    },
    {
      order: {
        ...awaiting,
        state: "accepted" as const,
        accepted_at: acceptedAt,
      },
      now: "2026-11-18T12:09:00.000Z",
      expected: { outcome: "already_accepted" },
      reason: "DT: a repeat after the deadline keeps the original acceptance",
    },
    {
      order: {
        ...awaiting,
        state: "preparing" as const,
        accepted_at: acceptedAt,
      },
      now: "2026-11-18T12:03:00.000Z",
      expected: { outcome: "already_accepted" },
      reason: "DT: a later milestone still counts as accepted, never undone",
    },
    {
      order: { ...awaiting, state: "cancelled" as const },
      now: "2026-11-18T12:01:00.000Z",
      expected: { outcome: "refused", code: "order_not_awaiting_acceptance" },
      reason: "DT: a cancelled Order cannot be accepted",
    },
    {
      order: {
        ...awaiting,
        state: "cancelled" as const,
        accepted_at: acceptedAt,
      },
      now: "2026-11-18T12:03:00.000Z",
      expected: { outcome: "refused", code: "order_not_awaiting_acceptance" },
      reason: "DT: a cancellation after acceptance is the current outcome",
    },
  ])("$reason", ({ order, now, expected }) => {
    expect(decideAcceptance(order, new Date(now))).toEqual(expected)
  })

  it.each([
    {
      order: awaiting,
      now: "2026-11-18T12:04:59.999Z",
      actions: ["accept"],
      reason: "BVA: 1 ms before the deadline, Accept is offered",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.000Z",
      actions: [],
      reason: "BVA: at the deadline, nothing is offered",
    },
    {
      order: {
        ...awaiting,
        state: "accepted" as const,
        accepted_at: acceptedAt,
      },
      now: "2026-11-18T12:01:00.000Z",
      actions: [],
      reason: "EP: an accepted Order offers no second Accept",
    },
  ])("$reason", ({ order, now, actions }) => {
    expect(availableActions(order, new Date(now))).toEqual(actions)
  })
})
