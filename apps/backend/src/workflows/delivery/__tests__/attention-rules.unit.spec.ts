import {
  decideAttention,
  stalledAttentionDueAt,
  unassignedAttentionDueAt,
  type AttentionRuleFacts,
} from "../attention-rules"

// Acceptance at 12:00 makes unassigned attention due at 12:10 (spec #48 story 42).
const due = new Date("2026-11-19T12:10:00.000Z")
const raised = new Date("2026-11-19T12:11:00.000Z")
const pickedUp = new Date("2026-11-19T12:40:00.000Z")

const facts = (
  overrides: {
    raised_at?: Date | null
    resolved_at?: Date | null
    assigned_agent_id?: string | null
    picked_up_at?: Date | null
    terminal_outcome?: "delivered" | "cancelled" | "failed" | null
    order_active?: boolean
    type?: AttentionRuleFacts["attention"]["type"]
    due_at?: string
  } = {},
): AttentionRuleFacts => ({
  attention: {
    type: overrides.type ?? "unassigned",
    due_at: overrides.due_at ? new Date(overrides.due_at) : due,
    raised_at: overrides.raised_at ?? null,
    resolved_at: overrides.resolved_at ?? null,
  },
  delivery: {
    assigned_agent_id: overrides.assigned_agent_id ?? null,
    picked_up_at: overrides.picked_up_at ?? null,
    terminal_outcome: overrides.terminal_outcome ?? null,
  },
  order_active: overrides.order_active ?? true,
})

describe("Unassigned attention deadline", () => {
  it("is due at acceptance plus ten minutes", () => {
    expect(
      unassignedAttentionDueAt(
        new Date("2026-11-19T12:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-11-19T12:10:00.000Z")
  })
})

describe("Stalled assigned work deadline", () => {
  it("is due thirty minutes after its origin: acceptance or pickup", () => {
    expect(
      stalledAttentionDueAt(new Date("2026-11-19T12:00:00.000Z")).toISOString(),
    ).toBe("2026-11-19T12:30:00.000Z")
  })
})

describe("Delivery attention decision", () => {
  it.each([
    {
      now: "2026-11-19T12:09:59.999Z",
      given: {},
      expected: { action: "wait" },
      reason: "BVA: 1 ms before acceptance plus ten minutes",
    },
    {
      now: "2026-11-19T12:10:00.000Z",
      given: {},
      expected: { action: "raise" },
      reason: "BVA: exactly at acceptance plus ten minutes",
    },
    {
      now: "2026-11-19T14:00:00.000Z",
      given: {},
      expected: { action: "raise" },
      reason: "EP: long after the deadline, as after downtime",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: { raised_at: raised },
      expected: { action: "keep" },
      reason: "EP: already raised, never raised again",
    },
    {
      now: "2026-11-19T12:05:00.000Z",
      given: { assigned_agent_id: "dagt_1" },
      expected: { action: "resolve", resolution: "assigned" },
      reason: "Decision table: assigned before it was due",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: { assigned_agent_id: "dagt_1", raised_at: raised },
      expected: { action: "resolve", resolution: "assigned" },
      reason: "Decision table: assigned after it was raised",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: { order_active: false },
      expected: { action: "resolve", resolution: "order_ended" },
      reason: "Decision table: the Order ended before it was raised",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: { order_active: false, raised_at: raised },
      expected: { action: "resolve", resolution: "order_ended" },
      reason: "Decision table: the Order ended after it was raised",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: {
        resolved_at: new Date("2026-11-19T12:12:00.000Z"),
        assigned_agent_id: "dagt_1",
      },
      expected: { action: "keep" },
      reason: "Decision table: already resolved stays as it is",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: {
        type: "access_revoked" as const,
        assigned_agent_id: "dagt_1",
        raised_at: raised,
      },
      expected: { action: "keep" },
      reason:
        "Decision table: revoked access stays outstanding on assigned work",
    },
    {
      now: "2026-11-19T12:20:00.000Z",
      given: {
        type: "access_revoked" as const,
        assigned_agent_id: "dagt_1",
        raised_at: raised,
        order_active: false,
      },
      expected: { action: "resolve", resolution: "order_ended" },
      reason: "Decision table: revoked access ends only with the Order",
    },
    // Stalled assigned work (#163): acceptance at 12:00 makes pickup
    // attention due at 12:30 (story 49); pickup at 12:40 makes transit
    // attention due at 13:10 (story 50).
    {
      now: "2026-11-19T12:29:59.999Z",
      given: {
        type: "assigned_without_pickup" as const,
        due_at: "2026-11-19T12:30:00.000Z",
        assigned_agent_id: "dagt_1",
      },
      expected: { action: "wait" },
      reason: "BVA: 1 ms before acceptance plus thirty minutes",
    },
    {
      now: "2026-11-19T12:30:00.000Z",
      given: {
        type: "assigned_without_pickup" as const,
        due_at: "2026-11-19T12:30:00.000Z",
        assigned_agent_id: "dagt_1",
      },
      expected: { action: "raise" },
      reason: "BVA: exactly at acceptance plus thirty minutes",
    },
    {
      now: "2026-11-19T12:30:00.001Z",
      given: {
        type: "assigned_without_pickup" as const,
        due_at: "2026-11-19T12:30:00.000Z",
        assigned_agent_id: "dagt_1",
      },
      expected: { action: "raise" },
      reason: "BVA: 1 ms after acceptance plus thirty minutes",
    },
    {
      now: "2026-11-19T12:35:00.000Z",
      given: {
        type: "assigned_without_pickup" as const,
        due_at: "2026-11-19T12:30:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        raised_at: raised,
      },
      expected: { action: "resolve", resolution: "picked_up" },
      reason: "Decision table: pickup ends stalled collection",
    },
    {
      now: "2026-11-19T13:09:59.999Z",
      given: {
        type: "in_transit_without_delivery" as const,
        due_at: "2026-11-19T13:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "wait" },
      reason: "BVA: 1 ms before pickup plus thirty minutes",
    },
    {
      now: "2026-11-19T13:10:00.000Z",
      given: {
        type: "in_transit_without_delivery" as const,
        due_at: "2026-11-19T13:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "raise" },
      reason: "BVA: exactly at pickup plus thirty minutes",
    },
    {
      now: "2026-11-19T13:10:00.001Z",
      given: {
        type: "in_transit_without_delivery" as const,
        due_at: "2026-11-19T13:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "raise" },
      reason: "BVA: 1 ms after pickup plus thirty minutes",
    },
    {
      now: "2026-11-19T13:20:00.000Z",
      given: {
        type: "in_transit_without_delivery" as const,
        due_at: "2026-11-19T13:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        terminal_outcome: "delivered" as const,
      },
      expected: { action: "resolve", resolution: "delivered" },
      reason: "Decision table: handover ends stalled transit",
    },
    {
      now: "2026-11-19T13:20:00.000Z",
      given: {
        type: "in_transit_without_delivery" as const,
        due_at: "2026-11-19T13:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        terminal_outcome: "failed" as const,
        raised_at: raised,
      },
      expected: { action: "resolve", resolution: "order_ended" },
      reason: "Decision table: an operator-confirmed failure ends it",
    },
    {
      now: "2026-11-19T12:40:00.000Z",
      given: {
        type: "assigned_without_pickup" as const,
        due_at: "2026-11-19T12:30:00.000Z",
        assigned_agent_id: "dagt_1",
        terminal_outcome: "cancelled" as const,
      },
      expected: { action: "resolve", resolution: "order_ended" },
      reason: "Decision table: an authoritative cancellation ends it",
    },
    {
      now: "2026-11-19T13:20:00.000Z",
      given: {
        type: "access_revoked" as const,
        due_at: "2026-11-19T12:10:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        terminal_outcome: "delivered" as const,
        raised_at: raised,
      },
      expected: { action: "resolve", resolution: "delivered" },
      reason:
        "Decision table: a recorded handover makes revoked access obsolete",
    },
    // Unreachable Customer (#164): arrival at 12:50 makes attention due at
    // 13:00 (story 38). Contact attempts and elapsed time never end it.
    {
      now: "2026-11-19T12:59:59.999Z",
      given: {
        type: "arrived_without_handover" as const,
        due_at: "2026-11-19T13:00:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "wait" },
      reason: "BVA: 1 ms before arrival plus ten minutes",
    },
    {
      now: "2026-11-19T13:00:00.000Z",
      given: {
        type: "arrived_without_handover" as const,
        due_at: "2026-11-19T13:00:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "raise" },
      reason: "BVA: exactly at arrival plus ten minutes",
    },
    {
      now: "2026-11-19T13:00:00.001Z",
      given: {
        type: "arrived_without_handover" as const,
        due_at: "2026-11-19T13:00:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
      },
      expected: { action: "raise" },
      reason: "BVA: 1 ms after arrival plus ten minutes",
    },
    {
      now: "2026-11-19T15:00:00.000Z",
      given: {
        type: "arrived_without_handover" as const,
        due_at: "2026-11-19T13:00:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        raised_at: raised,
      },
      expected: { action: "keep" },
      reason: "Decision table: time alone never ends an unreachable Customer",
    },
    {
      now: "2026-11-19T13:05:00.000Z",
      given: {
        type: "arrived_without_handover" as const,
        due_at: "2026-11-19T13:00:00.000Z",
        assigned_agent_id: "dagt_1",
        picked_up_at: pickedUp,
        terminal_outcome: "delivered" as const,
        raised_at: raised,
      },
      expected: { action: "resolve", resolution: "delivered" },
      reason: "Decision table: the actual handover ends it",
    },
  ])("$reason → $expected.action", ({ now, given, expected }) => {
    expect(decideAttention(facts(given), new Date(now))).toEqual(expected)
  })
})
