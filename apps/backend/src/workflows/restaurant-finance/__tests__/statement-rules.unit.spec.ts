import {
  assembleStatementHeader,
  completenessOf,
  outcomesWithoutEntitlement,
  explainReceipt,
  statementEntry,
  statementDays,
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

/** A problem of the Restaurant's participation rather than of an Order. */
const participation = (code: ProblemCode): StatementProblem => ({
  code,
  count: 1,
  sources: [{ kind: "restaurant_participation", id: "rest_1" }],
})

const sum = (amount: string): Total => ({ status: "available", amount })
const withheld = (reason: UnavailableReason): Total => ({
  status: "unavailable",
  reason,
})

describe("A Restaurant statement's totals and availability (spec #52 §8)", () => {
  /**
   * Conditions: evidence problem, this month's recognition pending,
   * prepared-food compensation pending, earlier months pending, the service
   * fee's evidence and accrual, lifecycle. Unless a row says otherwise the
   * Restaurant was inactive all month: a verified zero fee.
   */
  it.each([
    {
      booked: [
        { food_credit: "76", commission: "4.56" },
        { food_credit: "600", commission: "30", is_adjustment: true },
      ],
      problems: [],
      food_credits: sum("76"),
      commission: sum("4.56"),
      adjustments: sum("570"),
      balance: sum("641.44"),
      completeness: "complete",
      reason:
        "DT: a delayed 600 credit and 30 commission contribute a 570 adjustment once",
    },
    {
      booked,
      problems: [problem("earlier_month_evidence_missing")],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: withheld("evidence_missing"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason:
        "DT: missing older evidence withholds adjustments and balance, not current ordinary totals",
    },
    {
      booked,
      problems: [],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: sum("214.84"),
      completeness: "complete",
      reason:
        "DT R1: nothing owed sums the booked amounts into a complete balance",
    },
    {
      booked: [],
      problems: [],
      food_credits: sum("0"),
      commission: sum("0"),
      adjustments: sum("0"),
      balance: sum("0"),
      completeness: "complete",
      reason: "EP: a fully inactive month with no activity shows actual zeros",
    },
    {
      booked,
      problems: [problem("missing_financial_basis")],
      food_credits: withheld("evidence_missing"),
      commission: withheld("evidence_missing"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason: "DT R2: missing evidence withholds both delivered totals",
    },
    {
      booked,
      problems: [
        problem("conflicting_recognition"),
        problem("recognition_pending"),
      ],
      food_credits: withheld("evidence_missing"),
      commission: withheld("evidence_missing"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason: "DT R3: missing evidence outranks pending processing",
    },
    {
      booked,
      problems: [problem("recognition_pending")],
      food_credits: withheld("processing_pending"),
      commission: withheld("processing_pending"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "processing_pending",
      reason: "DT R4: a handover still being recognized withholds both totals",
    },
    {
      booked,
      problems: [problem("prepared_food_credit_pending")],
      food_credits: withheld("processing_pending"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "processing_pending",
      reason:
        "DT R5: pending prepared-food compensation withholds only food credits",
    },
    {
      booked: [...booked, { food_credit: "152", commission: "0" }],
      problems: [],
      food_credits: sum("380"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: sum("366.84"),
      completeness: "complete",
      reason:
        "#229: recognized prepared-food compensation adds its credit and no commission",
    },
    {
      booked,
      problems: [problem("missing_outcome_evidence")],
      food_credits: withheld("evidence_missing"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason:
        "#229: a cancellation whose facts do not establish its outcome withholds only food credits",
    },
    {
      booked,
      problems: [problem("responsibility_unknown")],
      food_credits: withheld("evidence_missing"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason:
        "#229: a failed outcome without established responsibility infers no credit",
    },
    {
      booked,
      problems: [problem("cancellation_processing_pending")],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: sum("214.84"),
      completeness: "processing_pending",
      reason:
        "#229: an unassessed cancellation without prepared food changes no total but is not complete",
    },
    {
      booked,
      problems: [problem("earlier_month_processing_pending")],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: withheld("processing_pending"),
      balance: withheld("depends_on_unavailable"),
      completeness: "processing_pending",
      reason:
        "DT R6: earlier months' pending work becomes adjustments, so they and the balance wait",
    },
    {
      lifecycle: "closed" as const,
      booked,
      problems: [problem("recognition_pending")],
      food_credits: withheld("processing_pending"),
      commission: withheld("processing_pending"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
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
      adjustments: sum("0"),
      balance: sum("214.84"),
      completeness: "complete",
      reason: "DT R8: an ended month with nothing owed keeps its booked totals",
    },
    {
      booked,
      problems: [problem("recognition_pending", 0)],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: sum("0"),
      balance: sum("214.84"),
      completeness: "complete",
      reason: "BVA: a problem counted 0 times did not occur",
    },
    {
      booked: [{ food_credit: "600", commission: "30" }],
      problems: [],
      service_fee: "50",
      food_credits: sum("600"),
      commission: sum("30"),
      adjustments: sum("0"),
      balance: sum("520"),
      completeness: "complete",
      reason:
        "DT R9: food credits minus commission minus the fee, with no earlier balance",
    },
    {
      booked: [],
      problems: [],
      service_fee: "83.33",
      food_credits: sum("0"),
      commission: sum("0"),
      adjustments: sum("0"),
      balance: sum("-83.33"),
      completeness: "complete",
      reason: "DT R10: an active month without Orders still owes its fee",
    },
    {
      booked: [{ food_credit: "76", commission: "4.56" }],
      problems: [],
      service_fee: "100",
      food_credits: sum("76"),
      commission: sum("4.56"),
      adjustments: sum("0"),
      balance: sum("-28.56"),
      completeness: "complete",
      reason: "DT R11: charges above credits give an honest negative balance",
    },
    {
      booked,
      problems: [participation("participation_evidence_missing")],
      service_fee: null,
      food_credits: sum("228"),
      commission: sum("13.16"),
      fee: withheld("evidence_missing"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "incomplete",
      reason:
        "DT R12: unknown active days withhold the fee and balance, not food credits",
    },
    {
      booked,
      problems: [participation("service_fee_accrual_pending")],
      service_fee: null,
      food_credits: sum("228"),
      commission: sum("13.16"),
      fee: withheld("processing_pending"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
      completeness: "processing_pending",
      reason: "DT R13: an accrual not yet reconciled withholds fee and balance",
    },
    {
      booked,
      problems: [
        {
          code: "earlier_month_service_fee_pending" as const,
          count: 1,
          sources: [{ kind: "service_fee_month" as const, id: "2026-10" }],
        },
      ],
      food_credits: sum("228"),
      commission: sum("13.16"),
      adjustments: withheld("processing_pending"),
      balance: withheld("depends_on_unavailable"),
      completeness: "processing_pending",
      reason:
        "DT R14: an ended month's unaccrued fee will arrive as an adjustment, so adjustments wait",
    },
  ])(
    "$reason",
    ({
      lifecycle = "provisional" as const,
      booked,
      problems,
      service_fee = "0",
      ...expected
    }) => {
      const header = assembleStatementHeader({
        lifecycle,
        booked,
        problems,
        service_fee,
      })
      expect(header).toEqual({
        lifecycle,
        completeness: expected.completeness,
        totals: {
          food_credits: expected.food_credits,
          commission: expected.commission,
          service_fee: expected.fee ?? sum(service_fee ?? ""),
          adjustments: expected.adjustments,
          balance: expected.balance,
        },
        problems: problems.filter(({ count }) => count > 0),
      })
    },
  )

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

describe("What a statement shows of a cancellation's evidence (#233)", () => {
  const compensation = {
    food_credit_id: "fcred_1",
    cancellation_category: "operator_cancelled",
    cancelled_at: "2026-11-20T12:40:00.000Z",
    claim_deadline: "2026-11-20T12:35:00.000Z",
    preparation_started_at: "2026-11-20T12:10:00.000Z",
    ready_at: null,
    food_value_excluding_vat: "152",
    commission: "0",
  }
  const explained = {
    food_credit_id: "fcred_1",
    cancellation_category: "operator_cancelled",
    cancelled_at: "2026-11-20T12:40:00.000Z",
    preparation_started_at: "2026-11-20T12:10:00.000Z",
    ready_at: null,
    food_value_excluding_vat: "152",
    commission: "0",
  }
  const receiptOf = (outcome: string, evidence: unknown) => ({
    source_kind: "prepared_food_credit",
    source_id: "fcred_1",
    outcome,
    evidence,
  })

  it.each([
    {
      receipt: receiptOf("operator_cancelled", compensation),
      expected: explained,
      reason:
        "DT: an operator cancellation hides its accepted work's claim deadline",
    },
    {
      receipt: receiptOf("operator_cancelled", explained),
      expected: explained,
      reason:
        "DT: an operator cancellation without a claim deadline is shown as recorded",
    },
    {
      receipt: receiptOf("unassigned_timeout", {
        ...compensation,
        cancellation_category: "unassigned_timeout",
      }),
      expected: {
        ...compensation,
        cancellation_category: "unassigned_timeout",
      },
      reason:
        "DT: an unassigned timeout keeps the claim deadline that dates it",
    },
    {
      receipt: receiptOf("operator_cancelled", null),
      expected: null,
      reason: "DT: missing evidence stays missing",
    },
    {
      receipt: undefined,
      expected: null,
      reason: "DT: an entry without a readable receipt has no explanation",
    },
  ])("$reason", ({ receipt, expected }) => {
    expect(explainReceipt(receipt)).toEqual(expected)
  })
})

describe("A statement's month day by day (#228)", () => {
  const days = statementDays({
    month: "2026-02",
    counted_through: "2026-02-11",
    active_dates: ["2026-02-09", "2026-02-10"],
    unknown_dates: ["2026-02-01"],
    booked: [
      {
        posted_at: "2026-02-11T12:00:00.000Z",
        food_credit: "0",
        commission: "0",
        service_fee: "3.34",
        kind: "service_fee_difference",
      },
      // 23:30 UTC on 9 February is already 10 February in Copenhagen.
      {
        posted_at: "2026-02-09T23:30:00.000Z",
        food_credit: "76",
        commission: "4.56",
      },
      {
        posted_at: "2026-02-10T11:00:00.000Z",
        food_credit: "152",
        commission: "8.6",
      },
      {
        posted_at: "2026-02-09T12:00:00.000Z",
        food_credit: "40.25",
        commission: "2.41",
      },
    ],
  })

  it.each([
    {
      date: "2026-02-11",
      expected: { orders: 0, food_credit: "0", commission: "0", net: "-3.34" },
      reason:
        "DT: a fee adjustment changes the posting day's net without inventing an Order",
    },
    {
      date: "2026-02-01",
      expected: { participation: "unknown", orders: 0, net: "0" },
      reason: "DT: a date history cannot establish is unknown, not inactive",
    },
    {
      date: "2026-02-02",
      expected: { participation: "inactive", orders: 0, food_credit: "0" },
      reason: "EP: a reached date without activity was inactive",
    },
    {
      date: "2026-02-09",
      expected: {
        participation: "active",
        orders: 1,
        food_credit: "40.25",
        commission: "2.41",
        net: "37.84",
      },
      reason: "EP: an active date with its booked entries",
    },
    {
      date: "2026-02-10",
      expected: {
        participation: "active",
        orders: 2,
        food_credit: "228",
        commission: "13.16",
        net: "214.84",
      },
      reason: "BVA: an entry booked 23:30 UTC counts on the Copenhagen date",
    },
    {
      date: "2026-02-12",
      expected: { participation: "not_reached", orders: 0 },
      reason: "BVA: the day after the counted date is not reached yet",
    },
  ])("$reason", ({ date, expected }) => {
    expect(days.find((day) => day.date === date)).toMatchObject(expected)
  })

  it("has one entry per date of the month, in order", () => {
    expect(days.map(({ date }) => date)).toHaveLength(28)
    expect(days[0].date).toBe("2026-02-01")
    expect(days[27].date).toBe("2026-02-28")
  })
})

describe("Unsuccessful Orders processed with no entitlement (#229)", () => {
  it("counts each outcome once per Order, in a stable order", () => {
    expect(
      outcomesWithoutEntitlement([
        "restaurant_rejected",
        "acceptance_timeout",
        "restaurant_rejected",
      ]),
    ).toEqual([
      { outcome: "acceptance_timeout", count: 1 },
      { outcome: "restaurant_rejected", count: 2 },
    ])
  })

  it("shows none for a month without unsuccessful Orders", () => {
    expect(outcomesWithoutEntitlement([])).toEqual([])
  })
})
