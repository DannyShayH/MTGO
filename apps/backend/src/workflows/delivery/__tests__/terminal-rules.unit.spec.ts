import {
  decideHandover,
  decideTermination,
  type HandoverFacts,
} from "../terminal-rules"

const PICKED_UP = new Date("2026-11-19T12:25:00Z")
const ARRIVED = new Date("2026-11-19T12:40:00Z")

const base: HandoverFacts = {
  agent: { id: "agent_1", status: "authorized" },
  delivery: {
    order_id: "order_1",
    assigned_agent_id: "agent_1",
    active_agent_id: "agent_1",
    picked_up_at: PICKED_UP,
    terminal_outcome: null,
  },
  order_active: true,
  request_holder: null,
}
const with_ = (
  overrides: {
    agent?: Partial<HandoverFacts["agent"]>
    delivery?: Partial<HandoverFacts["delivery"]>
    order_active?: boolean
    request_holder?: HandoverFacts["request_holder"]
  } = {},
): HandoverFacts => ({
  agent: { ...base.agent, ...overrides.agent },
  delivery: { ...base.delivery, ...overrides.delivery },
  order_active: overrides.order_active ?? base.order_active,
  request_holder:
    overrides.request_holder === undefined
      ? base.request_holder
      : overrides.request_holder,
})

describe("decideHandover", () => {
  it.each([
    {
      reason: "DT: the responsible agent with recorded pickup delivers",
      facts: with_(),
      expected: { outcome: "deliver" },
    },
    {
      reason: "DT: handover needs a recorded pickup, whatever else is known",
      facts: with_({ delivery: { picked_up_at: null } }),
      expected: { outcome: "refused", code: "pickup_not_recorded" },
    },
    {
      reason: "DT: another agent is not responsible",
      facts: with_({ agent: { id: "agent_2" } }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: unassigned work has no responsible agent",
      facts: with_({
        delivery: { assigned_agent_id: null, active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: a revoked agent is signed out, even for its own delivery",
      facts: with_({ agent: { status: "revoked" } }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "DT: an ended Order cannot be delivered",
      facts: with_({ order_active: false }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: cancelled work stays cancelled",
      facts: with_({
        delivery: { terminal_outcome: "cancelled", active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: operator-confirmed failure stays failed",
      facts: with_({
        delivery: { terminal_outcome: "failed", active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: a repeat after handover returns the original outcome",
      facts: with_({
        delivery: { terminal_outcome: "delivered", active_agent_id: null },
        request_holder: { order_id: "order_1", agent_id: "agent_1" },
      }),
      expected: { outcome: "already_delivered" },
    },
    {
      reason: "DT: a second tap with a new identity keeps the original too",
      facts: with_({
        delivery: { terminal_outcome: "delivered", active_agent_id: null },
      }),
      expected: { outcome: "already_delivered" },
    },
    {
      reason: "DT: a delivered repeat is not offered to a revoked agent",
      facts: with_({
        agent: { status: "revoked" },
        delivery: { terminal_outcome: "delivered", active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "DT: a retry identity used for another delivery is refused",
      facts: with_({
        request_holder: { order_id: "order_2", agent_id: "agent_1" },
      }),
      expected: { outcome: "refused", code: "handover_request_reused" },
    },
    {
      reason: "DT: a retry identity used by another agent is refused",
      facts: with_({
        request_holder: { order_id: "order_1", agent_id: "agent_2" },
      }),
      expected: { outcome: "refused", code: "handover_request_reused" },
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideHandover(facts)).toEqual(expected)
  })

  it("never treats an arrival, a location or elapsed time as handover", () => {
    // The rule reads no such fact: only the agent's explicit confirmation.
    const facts = with_({ delivery: { picked_up_at: null } }) as HandoverFacts &
      Record<string, unknown>
    facts.arrived_at = ARRIVED
    facts.latest_location = { latitude: 55.7, longitude: 12.5 }
    expect(decideHandover(facts)).toEqual({
      outcome: "refused",
      code: "pickup_not_recorded",
    })
  })
})

describe("decideTermination", () => {
  it.each([
    {
      reason: "DT: active work ends with the authoritative cancellation",
      terminal_outcome: null,
      expected: { outcome: "end" },
    },
    {
      reason:
        "DT: a delivered outcome is never replaced by a later cancellation",
      terminal_outcome: "delivered" as const,
      expected: { outcome: "already_ended", terminal_outcome: "delivered" },
    },
    {
      reason: "DT: a repeat keeps the original terminal outcome",
      terminal_outcome: "cancelled" as const,
      expected: { outcome: "already_ended", terminal_outcome: "cancelled" },
    },
    {
      reason: "DT: an operator-confirmed failure is never rewritten",
      terminal_outcome: "failed" as const,
      expected: { outcome: "already_ended", terminal_outcome: "failed" },
    },
  ])("$reason", ({ terminal_outcome, expected }) => {
    expect(decideTermination({ terminal_outcome })).toEqual(expected)
  })
})
