import {
  CONTACT_ATTEMPT_LIMIT,
  arrivalAttentionDueAt,
  decideArrival,
  decideContactAttempt,
  type ArrivalFacts,
  type ContactAttemptFacts,
} from "../arrival-rules"

const PICKED_UP = new Date("2026-11-21T12:20:00Z")
const ARRIVED = new Date("2026-11-21T12:35:00Z")

const arrival = (
  overrides: {
    agent?: Partial<ArrivalFacts["agent"]>
    delivery?: Partial<ArrivalFacts["delivery"]>
    order_active?: boolean
    request_holder?: ArrivalFacts["request_holder"]
  } = {},
): ArrivalFacts => ({
  agent: { id: "agent_1", status: "authorized", ...overrides.agent },
  delivery: {
    order_id: "order_1",
    assigned_agent_id: "agent_1",
    active_agent_id: "agent_1",
    picked_up_at: PICKED_UP,
    arrived_at: null,
    terminal_outcome: null,
    ...overrides.delivery,
  },
  order_active: overrides.order_active ?? true,
  request_holder: overrides.request_holder ?? null,
})

describe("Arrival attention deadline", () => {
  it("is due at the recorded arrival plus ten minutes", () => {
    expect(arrivalAttentionDueAt(ARRIVED).toISOString()).toBe(
      "2026-11-21T12:45:00.000Z",
    )
  })
})

describe("decideArrival", () => {
  it.each([
    {
      reason: "DT: the responsible agent after pickup records arrival",
      facts: arrival(),
      expected: { outcome: "arrive" },
    },
    {
      reason: "DT: a repeat keeps the original arrival, whatever its identity",
      facts: arrival({ delivery: { arrived_at: ARRIVED } }),
      expected: { outcome: "already_arrived" },
    },
    {
      reason: "DT: arrival needs a recorded pickup",
      facts: arrival({ delivery: { picked_up_at: null } }),
      expected: { outcome: "refused", code: "pickup_not_recorded" },
    },
    {
      reason: "DT: another agent's delivery",
      facts: arrival({ delivery: { assigned_agent_id: "agent_2" } }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: revoked access",
      facts: arrival({ agent: { status: "revoked" } }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "DT: a cancelled Order",
      facts: arrival({ order_active: false }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: ended work refuses even a repeat",
      facts: arrival({
        delivery: {
          arrived_at: ARRIVED,
          terminal_outcome: "delivered",
          active_agent_id: null,
        },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: a retry identity used for another delivery",
      facts: arrival({
        request_holder: { order_id: "order_2", agent_id: "agent_1" },
      }),
      expected: { outcome: "refused", code: "arrival_request_reused" },
    },
    {
      reason: "DT: a retry identity used by another agent",
      facts: arrival({
        request_holder: { order_id: "order_1", agent_id: "agent_2" },
      }),
      expected: { outcome: "refused", code: "arrival_request_reused" },
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideArrival(facts)).toEqual(expected)
  })
})

const contact = (
  overrides: {
    agent?: Partial<ContactAttemptFacts["agent"]>
    delivery?: Partial<ContactAttemptFacts["delivery"]>
    order_active?: boolean
    attempt_count?: number
    request_holder?: ContactAttemptFacts["request_holder"]
  } = {},
): ContactAttemptFacts => ({
  agent: { id: "agent_1", status: "authorized", ...overrides.agent },
  delivery: {
    order_id: "order_1",
    assigned_agent_id: "agent_1",
    active_agent_id: "agent_1",
    picked_up_at: PICKED_UP,
    arrived_at: ARRIVED,
    terminal_outcome: null,
    ...overrides.delivery,
  },
  order_active: overrides.order_active ?? true,
  attempt_count: overrides.attempt_count ?? 0,
  request_holder: overrides.request_holder ?? null,
})

describe("decideContactAttempt", () => {
  it.each([
    {
      reason: "DT: the responsible agent after arrival records an attempt",
      facts: contact({ attempt_count: 2 }),
      expected: { outcome: "record" },
    },
    {
      reason: "DT: a repeat of the same attempt is not a new attempt",
      facts: contact({
        attempt_count: 1,
        request_holder: { order_id: "order_1", agent_id: "agent_1" },
      }),
      expected: { outcome: "already_recorded" },
    },
    {
      reason: "DT: the same retry identity on another delivery is refused",
      facts: contact({
        request_holder: { order_id: "order_2", agent_id: "agent_1" },
      }),
      expected: { outcome: "refused", code: "contact_attempt_request_reused" },
    },
    {
      reason: "DT: attempts follow a recorded arrival",
      facts: contact({ delivery: { arrived_at: null } }),
      expected: { outcome: "refused", code: "arrival_not_recorded" },
    },
    {
      reason: "DT: another agent's delivery",
      facts: contact({ delivery: { assigned_agent_id: "agent_2" } }),
      expected: { outcome: "refused", code: "delivery_not_responsible" },
    },
    {
      reason: "DT: revoked access",
      facts: contact({ agent: { status: "revoked" } }),
      expected: { outcome: "refused", code: "delivery_agent_not_authorized" },
    },
    {
      reason: "DT: ended work",
      facts: contact({
        delivery: { terminal_outcome: "cancelled", active_agent_id: null },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "DT: an inactive Order refuses even a repeat",
      facts: contact({
        order_active: false,
        request_holder: { order_id: "order_1", agent_id: "agent_1" },
      }),
      expected: { outcome: "refused", code: "delivery_not_active" },
    },
    {
      reason: "BVA: the last attempt below the limit is recorded",
      facts: contact({ attempt_count: CONTACT_ATTEMPT_LIMIT - 1 }),
      expected: { outcome: "record" },
    },
    {
      reason: "BVA: exactly at the limit is refused",
      facts: contact({ attempt_count: CONTACT_ATTEMPT_LIMIT }),
      expected: { outcome: "refused", code: "contact_attempt_limit_reached" },
    },
    {
      reason: "BVA: a repeat at the limit still returns its attempt",
      facts: contact({
        attempt_count: CONTACT_ATTEMPT_LIMIT,
        request_holder: { order_id: "order_1", agent_id: "agent_1" },
      }),
      expected: { outcome: "already_recorded" },
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideContactAttempt(facts)).toEqual(expected)
  })
})
