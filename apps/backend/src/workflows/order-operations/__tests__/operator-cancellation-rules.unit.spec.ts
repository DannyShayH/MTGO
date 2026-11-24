import { decideOperatorCancellation } from "../operator-cancellation-rules"

const acceptedAt = new Date("2026-11-24T12:00:00.000Z")
const cancel = { outcome: "cancel", category: "operator_cancelled" }
const unended = { terminal_outcome: null }

/**
 * Decision table (coding standard §8.2). Delivered means the Order or its
 * delivery recorded the handover; accepted means accepted and still active.
 *
 * | Rule | Cancelled? | Delivered? | Accepted? | Result                       |
 * | ---- | ---------- | ---------- | --------- | ---------------------------- |
 * | R1   | Yes        | -          | -         | already_cancelled            |
 * | R2   | No         | Yes        | -         | refused (order_delivered)    |
 * | R3   | No         | No         | No        | refused (order_not_accepted) |
 * | R4   | No         | No         | Yes       | cancel (operator_cancelled)  |
 *
 * R4 also takes one representative of each accepted stage (EP).
 */
describe("The Operator cancellation decision (#199)", () => {
  it.each([
    {
      order: { state: "accepted", accepted_at: acceptedAt },
      delivery: unended,
      expected: cancel,
      reason: "DT R4, EP: accepted work, unassigned or assigned",
    },
    {
      order: { state: "preparing", accepted_at: acceptedAt },
      delivery: unended,
      expected: cancel,
      reason: "DT R4, EP: food in preparation",
    },
    {
      order: { state: "ready", accepted_at: acceptedAt },
      delivery: unended,
      expected: cancel,
      reason: "DT R4, EP: food ready, also when the agent already picked it up",
    },
    {
      order: { state: "ready", accepted_at: acceptedAt },
      delivery: null,
      expected: cancel,
      reason: "DT R4: an accepted Order whose delivery is not readable",
    },
    {
      order: { state: "awaiting_acceptance", accepted_at: null },
      delivery: null,
      expected: { outcome: "refused", code: "order_not_accepted" },
      reason: "DT R3: before acceptance the Customer and Restaurant decide",
    },
    {
      order: {
        state: "ready",
        accepted_at: acceptedAt,
        delivery_outcome: "delivered",
      },
      delivery: { terminal_outcome: "delivered" },
      expected: { outcome: "refused", code: "order_delivered" },
      reason: "DT R2: the Order recorded the handover",
    },
    {
      order: {
        state: "ready",
        accepted_at: acceptedAt,
        delivery_outcome: null,
      },
      delivery: { terminal_outcome: "delivered" },
      expected: { outcome: "refused", code: "order_delivered" },
      reason:
        "DT R2: the handover committed but the Order has not copied it (#204)",
    },
    {
      order: { state: "cancelled", accepted_at: acceptedAt },
      delivery: { terminal_outcome: "cancelled" },
      expected: { outcome: "already_cancelled" },
      reason:
        "DT R1: a recorded cancellation is the current outcome for a repeat",
    },
  ] as const)(
    "decides $expected.outcome ($reason)",
    ({ order, delivery, expected }) => {
      expect(decideOperatorCancellation(order, delivery)).toEqual(expected)
    },
  )
})
