import { MathBN, MedusaError, OrderStatus } from "@medusajs/framework/utils"
import type { RefundOutcome } from "../../modules/order-operation/models/refund-obligation"
import type { RefundAttemptOutcome } from "../../modules/order-operation/models/refund-attempt"
import { SYSTEM_ACTOR } from "./rules"

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

export type { RefundAttemptOutcome }

/**
 * The history entry an attempt leaves (#197), from what it recorded on the
 * obligation. An attempt the provider still holds is `in_progress` and has
 * no failure yet; only a failed attempt keeps its safe failure code.
 */
export function refundAttemptEntry(recorded: {
  status: RefundOutcome
  failure_code: RefundFailureCode | null
}): { outcome: RefundAttemptOutcome; failure_code: RefundFailureCode | null } {
  if (recorded.status === "failed")
    return { outcome: "failed", failure_code: recorded.failure_code }
  return {
    outcome: recorded.status === "succeeded" ? "succeeded" : "in_progress",
    failure_code: null,
  }
}

/** The kinds of actor an id can name, read from Medusa's id prefix. */
export type RefundActorType =
  "system" | "user" | "restaurant_staff" | "customer"

const ACTOR_TYPES: [prefix: string, type: RefundActorType][] = [
  ["user_", "user"],
  ["rstf_", "restaurant_staff"],
  ["cus_", "customer"],
]

/**
 * Who an attempt's log record names: `system`, or the actor's id with its
 * type read from Medusa's id prefix. An id of unknown kind is named without
 * a type rather than guessed.
 */
export function refundAttemptActor(attempted_by: string): {
  actor_type?: RefundActorType
  actor_id: string
} {
  if (attempted_by === SYSTEM_ACTOR)
    return { actor_type: "system", actor_id: attempted_by }
  const match = ACTOR_TYPES.find(([prefix]) => attempted_by.startsWith(prefix))
  return match
    ? { actor_type: match[1], actor_id: attempted_by }
    : { actor_id: attempted_by }
}

/** Who triggered a cancellation or refund attempt, as an operator sees it. */
export type RefundActor = {
  type: RefundActorType | null
  id: string
  /** "System", or the operator's or staff member's name; null when unknown. */
  name: string | null
}

/**
 * The operator's view of a recorded actor id (#198): the system is always
 * "System"; anyone else carries the name looked up for them, and a Customer,
 * whom the Order already identifies, has none.
 */
export function toRefundActor(
  id: string,
  names: ReadonlyMap<string, string>,
): RefundActor {
  const { actor_type } = refundAttemptActor(id)
  if (actor_type === "system") return { type: "system", id, name: "System" }
  return { type: actor_type ?? null, id, name: names.get(id) ?? null }
}

/** The ids among `ids` of one actor type, once each. */
export function actorIdsOfType(ids: string[], type: RefundActorType) {
  return [...new Set(ids)].filter(
    (id) => refundAttemptActor(id).actor_type === type,
  )
}

/** An operator's retry asked for something it may not do (`NOT_ALLOWED`, 400). */
export const REFUND_RETRY_REFUSALS = ["refund_not_failed"] as const
/** No refund is owed for the Order (`NOT_FOUND`, 404). */
export const REFUND_NOT_FOUND = "refund_not_found"

export type RefundRetryDecision<T> =
  | { action: "retry"; obligation: T }
  | { action: "current" }
  | {
      action: "refuse"
      code: (typeof REFUND_RETRY_REFUSALS)[number] | typeof REFUND_NOT_FOUND
    }

/**
 * What an operator's retry does (#198), decided under the Order's settlement
 * lock from the obligation as it is now. Only a failed refund is retried. A
 * succeeded one is the current outcome, so a retry that waited behind
 * another returns it rather than refunding again; a pending one is an
 * attempt still in progress and is left alone.
 */
export function decideRefundRetry<T extends { status: RefundOutcome }>(
  obligation: T | undefined,
): RefundRetryDecision<T> {
  if (!obligation) return { action: "refuse", code: REFUND_NOT_FOUND }
  if (obligation.status === "failed") return { action: "retry", obligation }
  if (obligation.status === "succeeded") return { action: "current" }
  return { action: "refuse", code: "refund_not_failed" }
}
