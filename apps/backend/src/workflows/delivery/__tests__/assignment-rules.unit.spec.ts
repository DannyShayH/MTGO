import { decideAssignment, type AssignmentFacts } from "../assignment-rules"

const deadline = new Date("2026-11-19T12:30:00.000Z")

const facts = (overrides: Partial<AssignmentFacts> = {}): AssignmentFacts => ({
  agent: {
    id: "dagt_1",
    status: "authorized",
    postal_codes: ["2200", "2100"],
    active_order_id: null,
  },
  delivery: {
    order_id: "order_1",
    pickup_postal_code: "2200",
    destination_postal_code: "2100",
    claim_deadline: deadline,
    assigned_agent_id: null,
  },
  order_active: true,
  actor_id: "dagt_1",
  request_holder: null,
  ...overrides,
})

const at = (iso: string) => new Date(iso)

describe("Delivery assignment decision", () => {
  it.each([
    {
      now: "2026-11-19T12:00:00.000Z",
      expected: { outcome: "assign" },
      reason: "EP: at acceptance",
    },
    {
      now: "2026-11-19T12:29:59.999Z",
      expected: { outcome: "assign" },
      reason: "BVA: 1 ms before acceptance plus thirty minutes",
    },
    {
      now: "2026-11-19T12:30:00.000Z",
      expected: { outcome: "refused", code: "claim_deadline_passed" },
      reason: "BVA: exactly at the cutoff is too late",
    },
    {
      now: "2026-11-19T12:30:00.001Z",
      expected: { outcome: "refused", code: "claim_deadline_passed" },
      reason: "BVA: 1 ms after the cutoff",
    },
  ])("$reason", ({ now, expected }) => {
    expect(decideAssignment(facts(), at(now))).toEqual(expected)
  })

  const now = at("2026-11-19T12:10:00.000Z")
  const agent = facts().agent
  const delivery = facts().delivery

  it.each([
    {
      reason: "EP: only the pickup postal code is approved",
      given: facts({ agent: { ...agent, postal_codes: ["2200"] } }),
      expected: { outcome: "refused", code: "delivery_outside_approved_areas" },
    },
    {
      reason: "EP: only the destination postal code is approved",
      given: facts({ agent: { ...agent, postal_codes: ["2100"] } }),
      expected: { outcome: "refused", code: "delivery_outside_approved_areas" },
    },
    {
      reason: "EP: no approved areas",
      given: facts({ agent: { ...agent, postal_codes: [] } }),
      expected: { outcome: "refused", code: "delivery_outside_approved_areas" },
    },
    {
      reason: "EP: the agent already holds another active delivery",
      given: facts({ agent: { ...agent, active_order_id: "order_2" } }),
      expected: {
        outcome: "refused",
        code: "delivery_agent_has_active_delivery",
      },
    },
    {
      reason: "EP: another agent holds it, without naming them",
      given: facts({ delivery: { ...delivery, assigned_agent_id: "dagt_2" } }),
      expected: { outcome: "refused", code: "delivery_already_assigned" },
    },
    {
      reason: "EP: the Order is no longer active accepted work",
      given: facts({ order_active: false }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "EP: a pending agent is refused before their own assignment",
      given: facts({
        agent: { ...agent, status: "pending" },
        delivery: { ...delivery, assigned_agent_id: "dagt_1" },
      }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "EP: a revoked agent is refused before their own assignment",
      given: facts({
        agent: { ...agent, status: "revoked" },
        delivery: { ...delivery, assigned_agent_id: "dagt_1" },
      }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "EP: the retry identity was used for another delivery",
      given: facts({
        request_holder: {
          order_id: "order_2",
          agent_id: "dagt_1",
          actor_id: "dagt_1",
        },
      }),
      expected: { outcome: "refused", code: "assignment_request_reused" },
    },
    {
      reason: "EP: the retry identity was used for another agent",
      given: facts({
        request_holder: {
          order_id: "order_1",
          agent_id: "dagt_2",
          actor_id: "dagt_1",
        },
      }),
      expected: { outcome: "refused", code: "assignment_request_reused" },
    },
    {
      reason:
        "EP: the responsible agent's repeat recovers the original assignment, even with no areas left",
      given: facts({
        agent: { ...agent, postal_codes: [], active_order_id: "order_1" },
        delivery: { ...delivery, assigned_agent_id: "dagt_1" },
        request_holder: {
          order_id: "order_1",
          agent_id: "dagt_1",
          actor_id: "dagt_1",
        },
      }),
      expected: { outcome: "already_assigned" },
    },
    {
      reason: "EP: the retry identity was used by another actor (an operator)",
      given: facts({
        actor_id: "user_operator",
        request_holder: {
          order_id: "order_1",
          agent_id: "dagt_1",
          actor_id: "dagt_1",
        },
      }),
      expected: { outcome: "refused", code: "assignment_request_reused" },
    },
    {
      reason:
        "EP: a responsible agent's repeat on an Order that is no longer active is refused",
      given: facts({
        order_active: false,
        delivery: { ...delivery, assigned_agent_id: "dagt_1" },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
  ])("$reason", ({ given, expected }) => {
    expect(decideAssignment(given, now)).toEqual(expected)
  })

  it("recovers the original assignment after the claim deadline", () => {
    const assigned = facts({
      delivery: { ...delivery, assigned_agent_id: "dagt_1" },
    })
    expect(decideAssignment(assigned, at("2026-11-19T13:00:00.000Z"))).toEqual({
      outcome: "already_assigned",
    })
  })
})
