import type { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"
import type { RefundOutcome } from "../../modules/order-operation/models/refund-obligation"

/** A stored timestamp as ISO text, or null when it was never recorded. */
export const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null

export type CancellationFacts = {
  cancelled_at?: Date | string | null
  cancellation_category?: CancellationCategory | null
  acceptance_deadline?: Date | string | null
}

/**
 * The cancellation as anyone authorized may see it: no free-text reason.
 * `cancelled_at` is when the server processed it; `effective_at` is when it
 * took effect. They differ for a timeout recovered after downtime (#144),
 * which took effect at the acceptance deadline.
 */
export type CancellationOutcome = {
  category: CancellationCategory
  cancelled_at: string
  effective_at: string
} | null

export const cancellationOutcome = (
  facts: CancellationFacts,
): CancellationOutcome => {
  if (!facts.cancelled_at || !facts.cancellation_category) return null
  const cancelled_at = iso(facts.cancelled_at)!
  return {
    category: facts.cancellation_category,
    cancelled_at,
    effective_at:
      (facts.cancellation_category === "acceptance_timeout" &&
        iso(facts.acceptance_deadline)) ||
      cancelled_at,
  }
}

type ObligationRow = {
  order_id: string
  status: RefundOutcome
  amount: unknown
  currency_code: string
  last_attempted_at: Date | string | null
  succeeded_at: Date | string | null
}

/**
 * The minimal refund outcome (#143). A failed refund stays `failed`, so it
 * reads as still owed and never as money returned.
 */
export type RefundOutcomeView = {
  status: RefundOutcome
  amount_including_vat: number
  currency_code: string
  last_attempted_at: string | null
  succeeded_at: string | null
} | null

const toRefundView = (row: ObligationRow): RefundOutcomeView => ({
  status: row.status,
  amount_including_vat: Number(row.amount),
  currency_code: row.currency_code,
  last_attempted_at: iso(row.last_attempted_at),
  succeeded_at: iso(row.succeeded_at),
})

/** Each Order's refund outcome, with one indexed query on `order_id`. */
export async function refundOutcomesOf(
  container: MedusaContainer,
  orderIds: string[],
): Promise<Map<string, RefundOutcomeView>> {
  if (!orderIds.length) return new Map()
  const rows = (await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listRefundObligations(
      { order_id: orderIds },
      {
        select: [
          "order_id",
          "status",
          "amount",
          "currency_code",
          "last_attempted_at",
          "succeeded_at",
        ],
      },
    )) as unknown as ObligationRow[]
  return new Map(rows.map((row) => [row.order_id, toRefundView(row)]))
}
