import { MedusaError } from "@medusajs/framework/utils"
import {
  actorIdsOfType,
  classifyRefundFailure,
  decideRefundRetry,
  nativeCancellationPlan,
  owedFullRefund,
  refundAttemptActor,
  refundAttemptEntry,
  refundAttemptPlan,
  refundOutcomeAfterAttempt,
  toRefundActor,
} from "../refund-rules"

describe("The full refund owed at cancellation", () => {
  const payment = (id: string, captures: unknown[], refunds: unknown[] = []) =>
    ({ id, currency_code: "dkk", captures, refunds }) as never

  it.each([
    {
      payments: [payment("pay_1", [{ raw_amount: { value: "190" } }])],
      expected: { payment_id: "pay_1", amount: "190", currency_code: "dkk" },
      reason: "EP: one captured payment is owed in full",
    },
    {
      payments: [
        payment(
          "pay_1",
          [{ raw_amount: { value: "190" } }],
          [{ raw_amount: { value: "40.5" } }],
        ),
      ],
      expected: { payment_id: "pay_1", amount: "149.5", currency_code: "dkk" },
      reason: "EP: an earlier refund is deducted with exact decimals",
    },
    {
      payments: [payment("pay_1", [{ raw_amount: 95 }, { raw_amount: "95" }])],
      expected: { payment_id: "pay_1", amount: "190", currency_code: "dkk" },
      reason: "EP: plain numbers and strings are summed like raw values",
    },
    {
      payments: [
        payment(
          "pay_1",
          [{ raw_amount: { value: "190" } }],
          [{ raw_amount: { value: "190" } }],
        ),
        payment("pay_2", [{ raw_amount: { value: "30" } }]),
      ],
      expected: { payment_id: "pay_2", amount: "30", currency_code: "dkk" },
      reason:
        "BVA: a fully refunded payment owes nothing, the next one is used",
    },
    {
      payments: [payment("pay_1", [])],
      expected: null,
      reason: "EP: nothing captured, nothing owed",
    },
    {
      payments: [{ id: "pay_1", currency_code: "dkk" } as never],
      expected: null,
      reason: "EP: a payment read without captures or refunds owes nothing",
    },
    { payments: [], expected: null, reason: "EP: no payments at all" },
  ])("$reason", ({ payments, expected }) => {
    expect(owedFullRefund(payments)).toEqual(expected)
  })
})

describe("Classifying a failed refund attempt", () => {
  it.each([
    {
      error: new MedusaError(MedusaError.Types.CONFLICT, "still running"),
      expected: "refund_in_progress",
      reason: "EP: the provider still holds an attempt with this key",
    },
    {
      error: new MedusaError(MedusaError.Types.INVALID_DATA, "too much"),
      expected: "refund_rejected",
      reason: "EP: Medusa refused the amount",
    },
    {
      error: new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "other"),
      expected: "refund_provider_failed",
      reason: "EP: any other Medusa error",
    },
    {
      error: new Error("mock provider declined"),
      expected: "refund_provider_failed",
      reason: "EP: a provider's own error",
    },
  ])("$reason", ({ error, expected }) => {
    expect(classifyRefundFailure(error)).toBe(expected)
  })
})

describe("The recorded outcome of a refund attempt", () => {
  it.each([
    {
      failure: undefined,
      verified: true,
      expected: { status: "succeeded", failure_code: null },
      reason: "DT: no error and a persisted succeeded refund",
    },
    {
      failure: undefined,
      verified: false,
      expected: { status: "failed", failure_code: "refund_unverified" },
      reason: "DT: no error but no persisted refund is never claimed as paid",
    },
    {
      failure: "refund_provider_failed" as const,
      verified: false,
      expected: { status: "failed", failure_code: "refund_provider_failed" },
      reason: "DT: a provider failure stays owed",
    },
    {
      failure: "refund_provider_failed" as const,
      verified: true,
      expected: { status: "succeeded", failure_code: null },
      reason: "DT: a lost response after the refund went through is a success",
    },
    {
      failure: "refund_in_progress" as const,
      verified: false,
      expected: { status: "pending", failure_code: "refund_in_progress" },
      reason: "DT: an attempt still in progress stays pending, never failed",
    },
  ])("$reason", ({ failure, verified, expected }) => {
    expect(refundOutcomeAfterAttempt(failure, verified)).toEqual(expected)
  })
})

describe("Planning native cancellation", () => {
  it.each([
    {
      order: {
        status: "pending",
        items: [{ id: "item_1" }, { id: "item_2" }],
        payment_collections: [
          {
            id: "paycol_1",
            payments: [
              { id: "pay_captured", captures: [{ id: "capt_1" }] },
              { id: "pay_authorized", captures: [] },
              { id: "pay_unread" },
            ],
          },
        ],
      },
      expected: {
        pending: true,
        line_item_ids: ["item_1", "item_2"],
        uncaptured_payment_ids: ["pay_authorized", "pay_unread"],
        payment_collection_ids: ["paycol_1"],
      },
      reason: "EP: an active Order releases items and uncaptured payments only",
    },
    {
      order: {
        status: "pending",
        payment_collections: [{ id: "paycol_1" }],
      },
      expected: {
        pending: true,
        line_item_ids: [],
        uncaptured_payment_ids: [],
        payment_collection_ids: ["paycol_1"],
      },
      reason:
        "BVA: an Order read without items or payments has nothing to release",
    },
    {
      order: { status: "canceled" },
      expected: {
        pending: false,
        line_item_ids: [],
        uncaptured_payment_ids: [],
        payment_collection_ids: [],
      },
      reason: "EP: an Order Medusa already cancelled needs nothing more",
    },
  ])("$reason", ({ order, expected }) => {
    expect(nativeCancellationPlan({ id: "order_1", ...order })).toEqual(
      expected,
    )
  })
})

describe("What a refund attempt does with fresh payment facts (#144)", () => {
  const key = "mtogo-full-refund:order_1"
  const payment = (refunds: unknown[] = []) =>
    ({
      id: "pay_1",
      currency_code: "dkk",
      captures: [{ raw_amount: { value: "190" } }],
      refunds,
    }) as never
  const owed = {
    status: "pending" as const,
    amount: "190",
    idempotency_key: key,
  }

  it.each([
    {
      obligation: owed,
      payment: payment(),
      expected: { action: "attempt" },
      reason: "EP: nothing refunded yet, so the owed amount is sent",
    },
    {
      obligation: owed,
      payment: payment([
        {
          raw_amount: { value: "190" },
          idempotency_key: key,
          status: "succeeded",
        },
      ]),
      expected: { action: "record_success" },
      reason:
        "DT: a lost response whose refund persisted is recorded, never sent again",
    },
    {
      obligation: owed,
      payment: payment([
        {
          raw_amount: { value: "190" },
          idempotency_key: key,
          status: "pending",
        },
      ]),
      expected: { action: "attempt" },
      reason:
        "DT: an interrupted attempt resumes with the same key; Medusa decides if it is stale",
    },
    {
      obligation: owed,
      payment: payment([
        {
          raw_amount: { value: "40" },
          idempotency_key: "operator-partial",
          status: "succeeded",
        },
      ]),
      expected: { action: "refuse", failure_code: "refund_exceeds_remaining" },
      reason:
        "DT: money refunded elsewhere since cancellation is never sent on top",
    },
    {
      obligation: { ...owed, status: "failed" as const },
      payment: payment(),
      expected: { action: "leave" },
      reason: "DT: an explicit failure stays owed for the operator (#49)",
    },
    {
      obligation: { ...owed, status: "succeeded" as const },
      payment: payment(),
      expected: { action: "leave" },
      reason: "DT: a succeeded refund is never repeated",
    },
  ])("$reason", ({ obligation, payment, expected }) => {
    expect(refundAttemptPlan(obligation, payment)).toEqual(expected)
  })
})

describe("The history entry a refund attempt leaves (#197)", () => {
  it.each([
    {
      recorded: { status: "succeeded", failure_code: null },
      expected: { outcome: "succeeded", failure_code: null },
      reason: "EP: a verified refund is a success",
    },
    {
      recorded: { status: "failed", failure_code: "refund_provider_failed" },
      expected: { outcome: "failed", failure_code: "refund_provider_failed" },
      reason: "EP: a failure keeps its safe failure code",
    },
    {
      recorded: { status: "failed", failure_code: "refund_exceeds_remaining" },
      expected: { outcome: "failed", failure_code: "refund_exceeds_remaining" },
      reason: "EP: a refused over-refund is a failed attempt",
    },
    {
      recorded: { status: "pending", failure_code: "refund_in_progress" },
      expected: { outcome: "in_progress", failure_code: null },
      reason: "EP: an attempt the provider still holds has no failure yet",
    },
  ] as const)("$reason", ({ recorded, expected }) => {
    expect(refundAttemptEntry(recorded)).toEqual(expected)
  })
})

describe("The actor a refund attempt log record names (#197)", () => {
  it.each([
    {
      attempted_by: "system",
      expected: { actor_type: "system", actor_id: "system" },
    },
    {
      attempted_by: "user_01ABC",
      expected: { actor_type: "user", actor_id: "user_01ABC" },
    },
    {
      attempted_by: "rstf_01ABC",
      expected: { actor_type: "restaurant_staff", actor_id: "rstf_01ABC" },
    },
    {
      attempted_by: "cus_01ABC",
      expected: { actor_type: "customer", actor_id: "cus_01ABC" },
    },
    {
      attempted_by: "unknown_01ABC",
      expected: { actor_id: "unknown_01ABC" },
    },
  ])("$attempted_by", ({ attempted_by, expected }) => {
    expect(refundAttemptActor(attempted_by)).toEqual(expected)
  })
})

describe("An operator's refund retry (#198)", () => {
  it.each([
    {
      obligation: { status: "failed" as const },
      expected: { action: "retry", obligation: { status: "failed" } },
      reason: "EP: only a failed refund is retried",
    },
    {
      obligation: { status: "succeeded" as const },
      expected: { action: "current" },
      reason:
        "EP: a retry that waited behind another finds it resolved and returns it",
    },
    {
      obligation: { status: "pending" as const },
      expected: { action: "refuse", code: "refund_not_failed" },
      reason: "EP: an attempt still in progress is not interfered with",
    },
    {
      obligation: undefined,
      expected: { action: "refuse", code: "refund_not_found" },
      reason: "EP: an Order without an owed refund has nothing to retry",
    },
  ])("$reason", ({ obligation, expected }) => {
    expect(decideRefundRetry(obligation)).toEqual(expected)
  })
})

describe("The actor an operator sees (#198)", () => {
  const names = new Map([
    ["user_01", "Olga Operator"],
    ["rstf_01", "Mette Jensen"],
  ])

  it.each([
    {
      id: "system",
      expected: { type: "system", id: "system", name: "System" },
      reason: "EP: the system is always shown as System",
    },
    {
      id: "user_01",
      expected: { type: "user", id: "user_01", name: "Olga Operator" },
      reason: "EP: an operator carries their name",
    },
    {
      id: "rstf_01",
      expected: {
        type: "restaurant_staff",
        id: "rstf_01",
        name: "Mette Jensen",
      },
      reason: "EP: Restaurant staff carry their name",
    },
    {
      id: "cus_01",
      expected: { type: "customer", id: "cus_01", name: null },
      reason: "EP: a Customer has no name; the Order identifies them",
    },
    {
      id: "legacy_01",
      expected: { type: null, id: "legacy_01", name: null },
      reason: "EP: an id of unknown kind is shown without a guessed type",
    },
  ])("$reason", ({ id, expected }) => {
    expect(toRefundActor(id, names)).toEqual(expected)
  })

  it("picks the ids of one actor type once each", () => {
    expect(
      actorIdsOfType(
        ["user_01", "system", "rstf_01", "user_01", "user_02", "cus_01"],
        "user",
      ),
    ).toEqual(["user_01", "user_02"])
  })
})
