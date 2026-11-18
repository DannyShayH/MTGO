import { MathBN, MedusaError, OrderStatus } from "@medusajs/framework/utils"
import type { RefundOutcome } from "../../modules/order-operation/models/refund-obligation"

/** A Medusa big number as Query returns it, raw or plain. */
type MonetaryValue = { value: string } | string | number

export type PaymentFacts = {
  id: string
  currency_code: string
  captures?: { raw_amount: MonetaryValue }[]
  refunds?: {
    raw_amount: MonetaryValue
    idempotency_key?: string | null
    status?: string
  }[]
}

const sumAmounts = (values: { raw_amount: MonetaryValue }[] = []) =>
  values.reduce<ReturnType<typeof MathBN.convert>>(
    (total, { raw_amount }) =>
      MathBN.add(
        total,
        typeof raw_amount === "object" ? raw_amount.value : raw_amount,
      ),
    MathBN.convert(0),
  )

/**
 * What a pre-acceptance cancellation owes the Customer (#143): everything
 * captured and not yet refunded, with Medusa's exact decimal arithmetic.
 * Placement captures one payment; should a second one ever owe money, the
 * first owed payment is used and the rest is an operator case.
 */
export function owedFullRefund(
  payments: PaymentFacts[],
): { payment_id: string; amount: string; currency_code: string } | null {
  for (const payment of payments) {
    const owed = MathBN.sub(
      sumAmounts(payment.captures),
      sumAmounts(payment.refunds),
    )
    if (MathBN.gt(owed, 0))
      return {
        payment_id: payment.id,
        amount: owed.toString(),
        currency_code: payment.currency_code,
      }
  }
  return null
}

/** Safe failure classes; provider messages and payloads are never stored. */
export type RefundFailureCode =
  | "refund_in_progress"
  | "refund_rejected"
  | "refund_unverified"
  | "refund_provider_failed"
  | "refund_exceeds_remaining"

/**
 * Medusa answers a key whose attempt the provider still holds with
 * `CONFLICT`, and an amount it refuses with `INVALID_DATA`. Anything else,
 * including the provider's own errors, is a provider failure.
 */
export function classifyRefundFailure(error: unknown): RefundFailureCode {
  if (error instanceof MedusaError) {
    if (error.type === MedusaError.Types.CONFLICT) return "refund_in_progress"
    if (error.type === MedusaError.Types.INVALID_DATA) return "refund_rejected"
  }
  return "refund_provider_failed"
}

/**
 * What an attempt leaves on the obligation. Success comes only from the
 * persisted refund, so a lost response after the money moved still counts,
 * while a clean return without a persisted refund never does. An attempt
 * still in progress stays pending: its outcome is not known yet.
 */
export function refundOutcomeAfterAttempt(
  failure: RefundFailureCode | undefined,
  verified: boolean,
): { status: RefundOutcome; failure_code: RefundFailureCode | null } {
  if (verified) return { status: "succeeded", failure_code: null }
  if (failure === "refund_in_progress")
    return { status: "pending", failure_code: failure }
  return { status: "failed", failure_code: failure ?? "refund_unverified" }
}

export type NativeOrderFacts = {
  id: string
  status: string
  items?: { id: string }[]
  payment_collections?: {
    id: string
    payments?: { id: string; captures?: { id: string }[] }[]
  }[]
}

/**
 * What native cancellation still has to do. An Order Medusa already
 * cancelled needs nothing, so a repeat emits no second event. Captured
 * payments are left to the separate full refund.
 */
export function nativeCancellationPlan(order: NativeOrderFacts) {
  if (order.status === OrderStatus.CANCELED)
    return {
      pending: false,
      line_item_ids: [] as string[],
      uncaptured_payment_ids: [] as string[],
      payment_collection_ids: [] as string[],
    }
  const collections = order.payment_collections ?? []
  return {
    pending: true,
    line_item_ids: (order.items ?? []).map(({ id }) => id),
    uncaptured_payment_ids: collections
      .flatMap(({ payments }) => payments ?? [])
      .filter((payment) => !payment.captures?.length)
      .map(({ id }) => id),
    payment_collection_ids: collections.map(({ id }) => id),
  }
}

export type RefundAttemptPlan =
  | { action: "leave" }
  | { action: "record_success" }
  | { action: "attempt" }
  | { action: "refuse"; failure_code: "refund_exceeds_remaining" }

/**
 * What an owed refund's next attempt does (#144), decided from the payment
 * as it is now rather than as it was at cancellation. Only a pending
 * obligation is attempted: a succeeded one is never repeated and an explicit
 * failure stays owed for the operator (#49). A refund already persisted as
 * succeeded under the obligation's key is recorded without contacting the
 * provider, so a lost response moves no money twice. Money refunded under
 * another key since cancellation would make the owed amount over-refund, so
 * it is refused rather than sent.
 */
export function refundAttemptPlan(
  obligation: {
    status: RefundOutcome
    amount: string
    idempotency_key: string
  },
  payment: PaymentFacts,
): RefundAttemptPlan {
  if (obligation.status !== "pending") return { action: "leave" }
  const ours = (payment.refunds ?? []).filter(
    (refund) => refund.idempotency_key === obligation.idempotency_key,
  )
  if (ours.some((refund) => refund.status === "succeeded"))
    return { action: "record_success" }
  const others = (payment.refunds ?? []).filter(
    (refund) => refund.idempotency_key !== obligation.idempotency_key,
  )
  const remaining = MathBN.sub(sumAmounts(payment.captures), sumAmounts(others))
  if (MathBN.lt(remaining, obligation.amount))
    return { action: "refuse", failure_code: "refund_exceeds_remaining" }
  return { action: "attempt" }
}
