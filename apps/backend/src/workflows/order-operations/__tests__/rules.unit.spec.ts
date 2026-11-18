import {
  acceptanceDeadline,
  acceptanceWindow,
  availableActions,
  decideAcceptance,
  decideCancellation,
  queueView,
  rejectionNote,
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
      actions: ["accept", "reject"],
      reason: "BVA: 1 ms before the deadline, Accept and Reject are offered",
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

describe("Cancelling an Order before acceptance", () => {
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
      expected: { outcome: "cancel", category: "restaurant_rejected" },
      reason: "BVA: 1 ms before the deadline the rejection applies",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.000Z",
      expected: { outcome: "cancel", category: "acceptance_timeout" },
      reason: "BVA: exactly at the deadline the Order times out instead",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.001Z",
      expected: { outcome: "cancel", category: "acceptance_timeout" },
      reason: "BVA: 1 ms after the deadline the Order times out instead",
    },
    {
      order: { ...awaiting, acceptance_deadline: null },
      now: "2026-11-18T12:00:00.000Z",
      expected: { outcome: "refused", code: "acceptance_timing_unavailable" },
      reason:
        "DT: a legacy Order is left to an operator, never refunded on a guessed deadline",
    },
    {
      order: {
        ...awaiting,
        state: "cancelled" as const,
      },
      now: "2026-11-18T12:01:00.000Z",
      expected: { outcome: "already_cancelled" },
      reason: "DT: a repeated rejection returns the recorded cancellation",
    },
    {
      order: {
        ...awaiting,
        state: "cancelled" as const,
      },
      now: "2026-11-18T12:09:00.000Z",
      expected: { outcome: "already_cancelled" },
      reason:
        "DT: a repeat after the deadline is still the recorded cancellation",
    },
    ...(["accepted", "preparing", "ready"] as const).map((state) => ({
      order: { ...awaiting, state, accepted_at: acceptedAt },
      now: "2026-11-18T12:03:00.000Z",
      expected: { outcome: "refused", code: "order_not_awaiting_acceptance" },
      reason: `DT: ${state} Orders go to an operator, not a staff rejection`,
    })),
  ])("$reason", ({ order, now, expected }) => {
    expect(
      decideCancellation(order, "restaurant_rejected", new Date(now)),
    ).toEqual(expected)
  })

  it("records a Customer cancellation in its own category", () => {
    expect(
      decideCancellation(
        awaiting,
        "customer_cancelled",
        new Date("2026-11-18T12:01:00.000Z"),
      ),
    ).toEqual({ outcome: "cancel", category: "customer_cancelled" })
  })
})

describe("The acceptance-timeout sweep's decision (#144)", () => {
  const awaiting = {
    state: "awaiting_acceptance" as const,
    acceptance_deadline: deadline,
    accepted_at: null,
  }

  it.each([
    {
      order: awaiting,
      now: "2026-11-18T12:04:59.999Z",
      expected: { outcome: "refused", code: "acceptance_window_open" },
      reason: "BVA: 1 ms before the deadline the window is still the staff's",
    },
    {
      order: awaiting,
      now: "2026-11-18T12:05:00.000Z",
      expected: { outcome: "cancel", category: "acceptance_timeout" },
      reason: "BVA: exactly at the deadline the Order times out",
    },
    {
      order: awaiting,
      now: "2026-11-18T14:30:00.000Z",
      expected: { outcome: "cancel", category: "acceptance_timeout" },
      reason:
        "EP: after downtime the Order times out, with no new window granted",
    },
    {
      order: { ...awaiting, acceptance_deadline: null },
      now: "2026-11-18T14:30:00.000Z",
      expected: { outcome: "refused", code: "acceptance_timing_unavailable" },
      reason:
        "DT: a legacy Order without a deadline never times out on a guess",
    },
    {
      order: {
        ...awaiting,
        state: "accepted" as const,
        accepted_at: new Date("2026-11-18T12:04:00.000Z"),
      },
      now: "2026-11-18T12:10:00.000Z",
      expected: { outcome: "refused", code: "order_not_awaiting_acceptance" },
      reason: "DT: an accepted Order is never cancelled by the timeout",
    },
    {
      order: { ...awaiting, state: "cancelled" as const },
      now: "2026-11-18T12:10:00.000Z",
      expected: { outcome: "already_cancelled" },
      reason: "DT: a repeated sweep finds the recorded cancellation",
    },
  ])("$reason", ({ order, now, expected }) => {
    expect(
      decideCancellation(order, "acceptance_timeout", new Date(now)),
    ).toEqual(expected)
  })
})

describe("An optional rejection reason", () => {
  it.each([
    { raw: undefined, expected: null, reason: "EP: omitted" },
    { raw: "", expected: null, reason: "BVA: empty" },
    { raw: "  \n\t ", expected: null, reason: "EP: only whitespace" },
    {
      raw: "  Out of dough  ",
      expected: "Out of dough",
      reason: "EP: surrounding whitespace is trimmed",
    },
    {
      raw: "Oven\u0000 broken\u0007",
      expected: "Oven broken",
      reason: "EP: control characters are removed",
    },
    {
      raw: "Line one\nLine two",
      expected: "Line one\nLine two",
      reason: "EP: a line break inside the note is kept",
    },
  ])("$reason", ({ raw, expected }) => {
    expect(rejectionNote(raw)).toBe(expected)
  })
})
