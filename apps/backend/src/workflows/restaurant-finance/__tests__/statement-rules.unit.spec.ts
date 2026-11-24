import {
  assembleStatementHeader,
  completenessOf,
  statementEntry,
  statementMonths,
  type ProblemCode,
  type StatementProblem,
  type Total,
  type UnavailableReason,
} from "../statement-rules"

const booked = [
  { food_credit: "76", commission: "4.56" },
  { food_credit: "152", commission: "8.6" },
]

const problem = (code: ProblemCode, count = 1): StatementProblem => ({
  code,
  count,
  sources: Array.from({ length: count }, (_, index) => ({
    kind: "order_delivered" as const,
    id: `order_${index + 1}`,
  })),
})

const sum = (amount: string): Total => ({ status: "available", amount })
const withheld = (reason: UnavailableReason): Total => ({
  status: "unavailable",
  reason,
})

describe("A Restaurant statement's totals and availability (spec #52 §8)", () => {
  /**
   * Conditions: evidence problem, this month's recognition pending,
   * prepared-food compensation pending, earlier months pending, lifecycle.
   * The service fee is not calculated yet, so the balance is always
   * withheld and no row reaches "complete".
   */
  it.each([
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [],
      food_credits: sum("228"),
      commission: sum("13.16"),
      completeness: "incomplete",
      reason:
        "DT R1: nothing owed sums the booked amounts; the fee keeps it incomplete",
    },
    {
      lifecycle: "provisional" as const,
      booked: [],
      problems: [],
      food_credits: sum("0"),
      commission: sum("0"),
      completeness: "incomplete",
      reason: "EP: a verified empty month shows actual zeros",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [problem("missing_financial_basis")],
      food_credits: withheld("evidence_missing"),
      commission: withheld("evidence_missing"),
      completeness: "incomplete",
      reason: "DT R2: missing evidence withholds both delivered totals",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [
        problem("conflicting_recognition"),
        problem("recognition_pending"),
      ],
      food_credits: withheld("evidence_missing"),
      commission: withheld("evidence_missing"),
      completeness: "incomplete",
      reason: "DT R3: missing evidence outranks pending processing",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [problem("recognition_pending")],
      food_credits: withheld("processing_pending"),
      commission: withheld("processing_pending"),
      completeness: "processing_pending",
      reason: "DT R4: a handover still being recognized withholds both totals",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [problem("prepared_food_credit_pending")],
      food_credits: withheld("processing_pending"),
      commission: sum("13.16"),
      completeness: "processing_pending",
      reason:
        "DT R5: pending prepared-food compensation withholds only food credits",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [problem("earlier_month_processing_pending")],
      food_credits: sum("228"),
      commission: sum("13.16"),
      completeness: "processing_pending",
      reason:
        "DT R6: earlier months' pending handovers become adjustments, not this month's totals",
    },
    {
      lifecycle: "closed" as const,
      booked,
      problems: [problem("recognition_pending")],
      food_credits: withheld("processing_pending"),
      commission: withheld("processing_pending"),
      completeness: "processing_pending",
      reason:
        "DT R7: an ended month with an unrecognized handover does not look final",
    },
    {
      lifecycle: "closed" as const,
      booked,
      problems: [],
      food_credits: sum("228"),
      commission: sum("13.16"),
      completeness: "incomplete",
      reason: "DT R8: an ended month with nothing owed keeps its booked totals",
    },
    {
      lifecycle: "provisional" as const,
      booked,
      problems: [problem("recognition_pending", 0)],
      food_credits: sum("228"),
      commission: sum("13.16"),
      completeness: "incomplete",
      reason: "BVA: a problem counted 0 times did not occur",
    },
  ])("$reason", ({ lifecycle, booked, problems, ...expected }) => {
    const header = assembleStatementHeader({ lifecycle, booked, problems })
    expect(header).toEqual({
      lifecycle,
      completeness: expected.completeness,
      totals: {
        food_credits: expected.food_credits,
        commission: expected.commission,
        service_fee: withheld("not_yet_supported"),
        adjustments: withheld("not_yet_supported"),
        balance: withheld("depends_on_unavailable"),
      },
      problems: problems.filter(({ count }) => count > 0),
    })
  })

  it.each([
    {
      totals: { food_credits: sum("228"), service_fee: sum("100") },
      problems: [],
      expected: "complete",
      reason: "DT: every component known and nothing owed is complete",
    },
    {
      totals: {
        food_credits: sum("228"),
        service_fee: withheld("not_yet_supported"),
      },
      problems: [],
      expected: "incomplete",
      reason: "DT: a component not calculated yet keeps the month incomplete",
    },
  ])("$reason", ({ totals, problems, expected }) => {
    expect(completenessOf(totals, problems)).toBe(expected)
  })
})

describe("The months a Restaurant has statements for (spec #52 §10)", () => {
  it.each([
    {
      created_at: "2026-11-10T09:00:00.000Z",
      now: "2026-11-24T12:00:00.000Z",
      expected: ["2026-11"],
      reason: "EP: created this month has only the current month",
    },
    {
      created_at: "2026-09-10T09:00:00.000Z",
      now: "2026-11-24T12:00:00.000Z",
      expected: ["2026-11", "2026-10", "2026-09"],
      reason: "EP: every month since creation, gaps included, newest first",
    },
    {
      created_at: "2025-12-15T09:00:00.000Z",
      now: "2026-01-10T12:00:00.000Z",
      expected: ["2026-01", "2025-12"],
      reason: "BVA: the months run back across a year change",
    },
    {
      created_at: "2026-10-31T22:59:59.999Z",
      now: "2026-11-24T12:00:00.000Z",
      expected: ["2026-11", "2026-10"],
      reason: "BVA: created 1 ms before Copenhagen midnight on 1 November",
    },
    {
      created_at: "2026-10-31T23:00:00.000Z",
      now: "2026-11-24T12:00:00.000Z",
      expected: ["2026-11"],
      reason: "BVA: created at Copenhagen midnight on 1 November",
    },
    {
      created_at: "2026-11-01T09:00:00.000Z",
      now: "2026-11-30T22:59:59.999Z",
      expected: ["2026-11"],
      reason: "BVA: 1 ms before December in Copenhagen has no December yet",
    },
    {
      created_at: "2026-11-01T09:00:00.000Z",
      now: "2026-11-30T23:00:00.000Z",
      expected: ["2026-12", "2026-11"],
      reason: "BVA: Copenhagen midnight on 1 December starts December",
    },
  ])("$reason", ({ created_at, now, expected }) => {
    expect(statementMonths(created_at, new Date(now))).toEqual(expected)
  })
})

describe("A statement entry's explanation (spec #52 §10)", () => {
  const entry = {
    id: "fje_1",
    kind: "delivered_order",
    order_id: "order_1",
    occurred_at: "2026-11-24T18:30:00.000Z",
    original_month: "2026-11",
    posted_at: new Date("2026-11-24T18:30:01.000Z"),
    posting_month: "2026-11",
    funded_by: "customer",
    food_credit: "40.25",
    commission: "2.41",
  }
  const receipt = {
    source_kind: "order_delivered",
    source_id: "order_1",
    outcome: "delivered",
    evidence: { terms_version: "common_mvp_v1" },
  }

  it.each([
    {
      receipt,
      order_id: "order_1",
      displayIds: new Map([["order_1", 1042]]),
      expected: {
        source: { kind: "order_delivered", id: "order_1" },
        order: { id: "order_1", display_id: 1042 },
        outcome: "delivered",
        calculation: { terms_version: "common_mvp_v1" },
      },
      reason: "EP: a recognized delivered Order with its number",
    },
    {
      receipt,
      order_id: "order_1",
      displayIds: new Map(),
      expected: {
        source: { kind: "order_delivered", id: "order_1" },
        order: { id: "order_1", display_id: null },
        outcome: "delivered",
        calculation: { terms_version: "common_mvp_v1" },
      },
      reason: "EP: an Order whose number could not be read",
    },
    {
      receipt: undefined,
      order_id: null,
      displayIds: new Map(),
      expected: {
        source: { kind: undefined, id: undefined },
        order: null,
        outcome: undefined,
        calculation: null,
      },
      reason: "EP: an entry without an Order or a readable receipt",
    },
  ])("$reason", ({ receipt, order_id, displayIds, expected }) => {
    expect(statementEntry({ ...entry, order_id }, receipt, displayIds)).toEqual(
      {
        id: "fje_1",
        kind: "delivered_order",
        ...expected,
        occurred_at: "2026-11-24T18:30:00.000Z",
        original_month: "2026-11",
        posted_at: "2026-11-24T18:30:01.000Z",
        posting_month: "2026-11",
        amounts: { food_credit: "40.25", commission: "2.41", net: "37.84" },
        funded_by: "customer",
        original_statement: null,
      },
    )
  })
})
