import {
  decideAttention,
  unassignedAttentionDueAt,
  type AttentionRuleFacts,
} from "../attention-rules"

// Acceptance at 12:00 makes unassigned attention due at 12:10 (spec #48 story 42).
const due = new Date("2026-11-19T12:10:00.000Z")
const raised = new Date("2026-11-19T12:11:00.000Z")

const facts = (
  overrides: {
    raised_at?: Date | null
    resolved_at?: Date | null
    assigned_agent_id?: string | null
    order_active?: boolean
  } = {},
): AttentionRuleFacts => ({
  attention: {
    type: "unassigned",
    due_at: due,
    raised_at: overrides.raised_at ?? null,
    resolved_at: overrides.resolved_at ?? null,
  },
  delivery: { assigned_agent_id: overrides.assigned_agent_id ?? null },
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
  ])("$reason → $expected.action", ({ now, given, expected }) => {
    expect(decideAttention(facts(given), new Date(now))).toEqual(expected)
  })
})
