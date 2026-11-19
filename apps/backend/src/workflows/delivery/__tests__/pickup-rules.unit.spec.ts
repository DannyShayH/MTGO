import { decidePickup, type PickupFacts } from "../pickup-rules"

const PICKED_UP = new Date("2026-11-19T12:25:00Z")
const READY = new Date("2026-11-19T12:20:00Z")

const base: PickupFacts = {
  agent: { id: "agent_1", status: "authorized" },
  delivery: {
    order_id: "order_1",
    assigned_agent_id: "agent_1",
    active_agent_id: "agent_1",
    picked_up_at: null,
  },
  order: { state: "ready", ready_at: READY },
  request_holder: null,
}
const with_ = (
  overrides: {
    agent?: Partial<PickupFacts["agent"]>
    delivery?: Partial<PickupFacts["delivery"]>
    order?: Partial<PickupFacts["order"]>
    request_holder?: PickupFacts["request_holder"]
  } = {},
): PickupFacts => ({
  agent: { ...base.agent, ...overrides.agent },
  delivery: { ...base.delivery, ...overrides.delivery },
  order: { ...base.order, ...overrides.order },
  request_holder:
    overrides.request_holder === undefined
      ? base.request_holder
      : overrides.request_holder,
})

describe("decidePickup", () => {
  it.each([
    {
      reason: "DT: the responsible agent with ready food records pickup",
      facts: with_(),
      expected: { outcome: "pick_up" },
    },
    {
      reason: "DT: accepted but not started is not ready",
      facts: with_({ order: { state: "accepted", ready_at: null } }),
      expected: { outcome: "refused", code: "food_not_ready" },
    },
    {
      reason: "DT: preparing is not ready",
      facts: with_({ order: { state: "preparing", ready_at: null } }),
      expected: { outcome: "refused", code: "food_not_ready" },
    },
    {
      reason: "DT: a ready state without the readiness fact is not ready",
      facts: with_({ order: { ready_at: null } }),
      expected: { outcome: "refused", code: "food_not_ready" },
    },
    {
      reason:
        "DT: a repeat with the original retry identity keeps the milestone",
      facts: with_({
        delivery: { picked_up_at: PICKED_UP },
        request_holder: { order_id: "order_1", agent_id: "agent_1" },
      }),
      expected: { outcome: "already_picked_up" },
    },
    {
      reason: "DT: a repeat with a fresh retry identity keeps the milestone",
      facts: with_({ delivery: { picked_up_at: PICKED_UP } }),
      expected: { outcome: "already_picked_up" },
    },
    {
      reason: "DT: another agent's delivery",
      facts: with_({ agent: { id: "agent_2" } }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: unassigned work",
      facts: with_({
        delivery: { assigned_agent_id: null, active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: revoked access, even on a repeat",
      facts: with_({
        agent: { status: "revoked" },
        delivery: { picked_up_at: PICKED_UP },
      }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "DT: a cancelled Order wins over a repeat",
      facts: with_({
        order: { state: "cancelled" },
        delivery: { picked_up_at: PICKED_UP },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: ended responsibility (capacity released) wins over a repeat",
      facts: with_({
        delivery: { active_agent_id: null, picked_up_at: PICKED_UP },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: a retry identity first used for another delivery",
      facts: with_({
        request_holder: { order_id: "order_2", agent_id: "agent_1" },
      }),
      expected: { outcome: "refused", code: "pickup_request_reused" },
    },
    {
      reason: "DT: a retry identity first used by another agent",
      facts: with_({
        request_holder: { order_id: "order_1", agent_id: "agent_2" },
      }),
      expected: { outcome: "refused", code: "pickup_request_reused" },
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decidePickup(facts)).toEqual(expected)
  })
})
