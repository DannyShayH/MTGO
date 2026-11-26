import { cancellationRecognition } from "../cancellation-rules"

const cancelledAt = new Date("2026-11-20T12:40:00.000Z")
const acceptanceDeadline = new Date("2026-11-20T12:05:00.000Z")
const claimDeadline = new Date("2026-11-20T12:35:00.000Z")
const preparedAt = new Date("2026-11-20T12:10:00.000Z")
const readyAt = new Date("2026-11-20T12:25:00.000Z")

const credit = {
  id: "fcred_1",
  amount: "152",
  commission_amount: "0",
  currency_code: "dkk",
  funded_by: "mtogo",
  reason: "unassigned_timeout",
  preparation_started_at: preparedAt,
  ready_at: readyAt,
}

const cancelled = (overrides: Record<string, unknown> = {}) => ({
  order_id: "order_1",
  category: "unassigned_timeout" as const,
  cancelled_at: cancelledAt,
  acceptance_deadline: acceptanceDeadline,
  claim_deadline: claimDeadline,
  food_credit: credit,
  ...overrides,
})

describe("How finance recognizes a cancelled Order (spec #52 §4; #229)", () => {
  it("recognizes an existing unassigned prepared-food credit once, MTOGO-funded with zero commission, dated by the claim deadline", () => {
    expect(cancellationRecognition(cancelled())).toEqual({
      status: "compensation",
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      outcome: "unassigned_timeout",
      occurred_at: claimDeadline,
      currency_code: "dkk",
      food_credit: "152",
      commission: "0",
      funded_by: "mtogo",
      evidence: {
        food_credit_id: "fcred_1",
        cancellation_category: "unassigned_timeout",
        cancelled_at: "2026-11-20T12:40:00.000Z",
        claim_deadline: "2026-11-20T12:35:00.000Z",
        preparation_started_at: "2026-11-20T12:10:00.000Z",
        ready_at: "2026-11-20T12:25:00.000Z",
        food_value_excluding_vat: "152",
        commission: "0",
      },
    })
  })

  /**
   * An operator cancellation's credit is dated by the operator's recorded
   * action (#233). Its accepted work usually has a claim deadline too, which
   * the evidence records as a fact but which never dates this outcome.
   */
  it.each([
    {
      claim_deadline: claimDeadline,
      ready_at: readyAt,
      recorded: {
        claim_deadline: "2026-11-20T12:35:00.000Z",
        ready_at: "2026-11-20T12:25:00.000Z",
      },
      reason: "DT: accepted work with an unassigned claim deadline, food ready",
    },
    {
      claim_deadline: null,
      ready_at: null,
      recorded: { claim_deadline: null, ready_at: null },
      reason: "DT: no claim deadline recorded, food not ready",
    },
  ])(
    "dates an operator cancellation's credit by the operator's action, never by a claim deadline: $reason",
    ({ claim_deadline, ready_at, recorded }) => {
      const result = cancellationRecognition(
        cancelled({
          category: "operator_cancelled",
          claim_deadline,
          food_credit: { ...credit, reason: "operator_cancelled", ready_at },
        }),
      )
      expect(result).toEqual({
        status: "compensation",
        source: { kind: "prepared_food_credit", id: "fcred_1" },
        outcome: "operator_cancelled",
        occurred_at: cancelledAt,
        currency_code: "dkk",
        food_credit: "152",
        commission: "0",
        funded_by: "mtogo",
        evidence: {
          food_credit_id: "fcred_1",
          cancellation_category: "operator_cancelled",
          cancelled_at: "2026-11-20T12:40:00.000Z",
          claim_deadline: recorded.claim_deadline,
          preparation_started_at: "2026-11-20T12:10:00.000Z",
          ready_at: recorded.ready_at,
          food_value_excluding_vat: "152",
          commission: "0",
        },
      })
    },
  )

  it.each([
    ["restaurant_rejected", cancelledAt],
    ["customer_cancelled", cancelledAt],
    ["operator_cancelled", cancelledAt],
    ["acceptance_timeout", acceptanceDeadline],
    ["unassigned_timeout", claimDeadline],
  ])(
    "EP: accounts for %s without prepared food as a processed outcome with no entitlement, dated by its qualifying moment",
    (category, occurred_at) => {
      expect(
        cancellationRecognition(cancelled({ category, food_credit: null })),
      ).toEqual({
        status: "no_entitlement",
        source: { kind: "order_cancelled", id: "order_1" },
        outcome: category,
        occurred_at,
        evidence: {
          cancellation_category: category,
          cancelled_at: "2026-11-20T12:40:00.000Z",
          qualifying_at: occurred_at.toISOString(),
        },
      })
    },
  )

  it("dates a legacy acceptance timeout without a deadline by its processing, inventing no deadline", () => {
    expect(
      cancellationRecognition(
        cancelled({
          category: "acceptance_timeout",
          acceptance_deadline: null,
          food_credit: null,
        }),
      ),
    ).toMatchObject({ status: "no_entitlement", occurred_at: cancelledAt })
  })

  it.each([
    {
      facts: cancelled({ category: null, food_credit: null }),
      source: { kind: "order_cancelled", id: "order_1" },
      reason: "EP: a cancellation without a recorded category",
    },
    {
      facts: cancelled({ claim_deadline: null }),
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      reason: "DT: an unassigned credit without its claim deadline",
    },
    {
      facts: cancelled({ claim_deadline: null, food_credit: null }),
      source: { kind: "order_cancelled", id: "order_1" },
      reason: "DT: an unassigned timeout without credit or claim deadline",
    },
    {
      facts: cancelled({ category: "restaurant_rejected" }),
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      reason: "DT: a credit whose reason is not the cancellation's",
    },
    {
      facts: cancelled({
        category: "customer_cancelled",
        food_credit: { ...credit, reason: "customer_cancelled" },
      }),
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      reason: "DT: a credit for an outcome that owes none",
    },
    {
      facts: cancelled({ food_credit: { ...credit, funded_by: "restaurant" } }),
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      reason: "DT: a credit not funded by MTOGO",
    },
    {
      facts: cancelled({
        food_credit: { ...credit, commission_amount: "0.01" },
      }),
      source: { kind: "prepared_food_credit", id: "fcred_1" },
      reason: "DT, BVA: a credit carrying the smallest commission, 0.01 DKK",
    },
  ])(
    "reports $reason as missing evidence instead of inferring an entitlement",
    ({ facts, source }) => {
      expect(cancellationRecognition(facts)).toEqual({
        status: "evidence_missing",
        source,
        occurred_at: cancelledAt,
      })
    },
  )
})
