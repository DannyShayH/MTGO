import {
  decideUnassignedCancellation,
  preparedFoodCredit,
} from "../unassigned-cancellation-rules"

// Accepted at 12:00, so the claim deadline is 12:30 (spec #48 stories 43-45).
const acceptedAt = new Date("2026-11-20T12:00:00.000Z")
const claimDeadline = new Date("2026-11-20T12:30:00.000Z")

describe("The thirty-minute unassigned cancellation decision (#162)", () => {
  const accepted = {
    state: "accepted" as const,
    accepted_at: acceptedAt,
  }
  const unassigned = { claim_deadline: claimDeadline, assigned_agent_id: null }

  it.each([
    {
      order: accepted,
      delivery: unassigned,
      now: "2026-11-20T12:29:59.999Z",
      expected: { outcome: "refused", code: "claim_window_open" },
      reason: "BVA: 1 ms before the deadline the work can still be claimed",
    },
    {
      order: accepted,
      delivery: unassigned,
      now: "2026-11-20T12:30:00.000Z",
      expected: { outcome: "cancel", category: "unassigned_timeout" },
      reason: "BVA: exactly at acceptance plus thirty minutes it is cancelled",
    },
    {
      order: accepted,
      delivery: unassigned,
      now: "2026-11-20T15:00:00.000Z",
      expected: { outcome: "cancel", category: "unassigned_timeout" },
      reason: "EP: after downtime it is cancelled, with no new window granted",
    },
    {
      order: { ...accepted, state: "preparing" as const },
      delivery: unassigned,
      now: "2026-11-20T12:30:00.000Z",
      expected: { outcome: "cancel", category: "unassigned_timeout" },
      reason: "EP: preparation does not protect unassigned work",
    },
    {
      order: { ...accepted, state: "ready" as const },
      delivery: unassigned,
      now: "2026-11-20T12:30:00.000Z",
      expected: { outcome: "cancel", category: "unassigned_timeout" },
      reason: "EP: ready food does not protect unassigned work",
    },
    {
      order: accepted,
      delivery: { ...unassigned, assigned_agent_id: "dagent_1" },
      now: "2026-11-20T15:00:00.000Z",
      expected: { outcome: "refused", code: "delivery_assigned" },
      reason: "DT: an earlier successful assignment prevents the cancellation",
    },
    {
      order: { ...accepted, state: "cancelled" as const },
      delivery: unassigned,
      now: "2026-11-20T12:31:00.000Z",
      expected: { outcome: "already_cancelled" },
      reason: "DT: a repeat finds the recorded cancellation",
    },
    {
      order: { state: "awaiting_acceptance" as const, accepted_at: null },
      delivery: unassigned,
      now: "2026-11-20T12:31:00.000Z",
      expected: { outcome: "refused", code: "order_not_accepted" },
      reason: "DT: unaccepted work is the acceptance timeout's, not this one",
    },
    {
      order: accepted,
      delivery: null,
      now: "2026-11-20T15:00:00.000Z",
      expected: { outcome: "refused", code: "delivery_unavailable" },
      reason: "DT: without a recorded delivery there is no durable deadline",
    },
  ])("$reason", ({ order, delivery, now, expected }) => {
    expect(
      decideUnassignedCancellation(order, delivery, new Date(now)),
    ).toEqual(expected)
  })
})

describe("The prepared-food credit an unassigned cancellation owes (ADR-0006)", () => {
  const prepared = {
    restaurant_id: "rest_1",
    preparation_started_at: new Date("2026-11-20T12:05:00.000Z"),
    ready_at: null,
  }
  const items = (...lines: [unit_price: string | number, quantity: number][]) =>
    lines.map(([unit_price, quantity]) => ({
      raw_unit_price: { value: String(unit_price) },
      quantity,
    }))

  it.each([
    {
      order: prepared,
      lines: items([125, 1]),
      expected: "100",
      reason: "EP: DKK 125 incl. 25% VAT is DKK 100 of food excl. VAT",
    },
    {
      order: prepared,
      lines: items([95.5, 2], [30, 1]),
      expected: "176.8",
      reason: "EP: every line and quantity counts; no commission is deducted",
    },
    {
      order: prepared,
      lines: items([1.255, 1]),
      expected: "1",
      reason: "BVA: just below the half (1.004) rounds down",
    },
    {
      order: prepared,
      lines: items([1.25625, 1]),
      expected: "1.01",
      reason: "BVA: an exact half (1.005) rounds once, away from zero",
    },
    {
      order: prepared,
      lines: items([1.2575, 1]),
      expected: "1.01",
      reason: "BVA: just above the half (1.006) rounds up",
    },
    {
      order: {
        ...prepared,
        ready_at: new Date("2026-11-20T12:20:00.000Z"),
      },
      lines: items([125, 1]),
      expected: "100",
      reason: "EP: ready food is prepared food",
    },
  ])("$reason", ({ order, lines, expected }) => {
    expect(preparedFoodCredit(order, lines, "dkk", claimDeadline)).toEqual({
      restaurant_id: "rest_1",
      amount: expected,
      currency_code: "dkk",
      preparation_started_at: order.preparation_started_at,
      ready_at: order.ready_at,
    })
  })

  it("DT: mere acceptance is no evidence of prepared food, so no credit is owed", () => {
    expect(
      preparedFoodCredit(
        { ...prepared, preparation_started_at: null },
        items([125, 1]),
        "dkk",
        claimDeadline,
      ),
    ).toBeNull()
  })

  it.each([
    { started: "2026-11-20T12:29:59.999Z", owed: true },
    { started: "2026-11-20T12:30:00.000Z", owed: false },
    { started: "2026-11-20T12:45:00.000Z", owed: false },
  ])(
    "BVA: preparation started at $started is credited: $owed (deadline 12:30)",
    ({ started, owed }) => {
      const credit = preparedFoodCredit(
        { ...prepared, preparation_started_at: new Date(started) },
        items([125, 1]),
        "dkk",
        claimDeadline,
      )
      expect(credit !== null).toBe(owed)
    },
  )
})
