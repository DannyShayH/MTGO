import { createLogRecord } from "@dtc/logging"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import {
  classifyRefundFailure,
  refundOutcomeAfterAttempt,
  type RefundFailureCode,
} from "./refund-rules"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { RefundOutcome } from "../../modules/order-operation/models/refund-obligation"

type Obligation = {
  id: string
  payment_id: string
  amount: unknown
  raw_amount: { value: string; precision?: number }
  idempotency_key: string
  status: RefundOutcome
  attempt_count: number
}

type PersistedRefund = {
  id: string
  status?: string
  raw_amount: { value: string }
}

/**
 * A refund provider or native cancellation step failed: one agreed
 * `upstream.request.failed` record carrying the Order, never the error text.
 */
export function logCancellationUpstreamFailure(
  container: MedusaContainer,
  order_id: string,
) {
  const record = createLogRecord("backend", "upstream.request.failed", {
    route: "/partner/orders/:id/reject",
    method: "POST",
    order_id,
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .log(record.level, record.msg, record)
}

/**
 * The refund the provider persisted for this obligation, if it succeeded.
 * The workflow's returned payment may be a snapshot from before the refund,
 * so success is only ever claimed from the stored refund row. A failed
 * attempt's row is soft-deleted and therefore never matches.
 */
async function verifiedRefund(
  container: MedusaContainer,
  obligation: Obligation,
): Promise<PersistedRefund | undefined> {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "refund",
      fields: ["id", "status", "raw_amount"],
      filters: {
        payment_id: obligation.payment_id,
        idempotency_key: obligation.idempotency_key,
      },
    })
  return (data as unknown as PersistedRefund[]).find(
    (refund) =>
      refund.status === "succeeded" &&
      MathBN.eq(refund.raw_amount.value, obligation.raw_amount.value),
  )
}

/**
 * Attempts an Order's owed full refund once (#143), never throwing: every
 * outcome is recorded on the obligation instead. A succeeded obligation is
 * left alone, so a repeat moves no money and creates no second credit line.
 * Each attempt sends the stored amount and idempotency key, which lets
 * Medusa resume or replay the same refund rather than start another.
 *
 * Shared with the later timeout, Customer-cancellation and recovery work.
 */
export async function attemptFullRefund(
  container: MedusaContainer,
  input: { order_id: string; created_by: string },
): Promise<RefundOutcome | null> {
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [found] = await service.listRefundObligations(
    { order_id: input.order_id },
    { take: 1 },
  )
  const obligation = found as unknown as Obligation | undefined
  if (!obligation) return null
  if (obligation.status === "succeeded") return "succeeded"

  await service.updateRefundObligations({
    id: obligation.id,
    status: "pending",
    attempt_count: obligation.attempt_count + 1,
    last_attempted_at: new Date(),
    failure_code: null,
  })
  let failure: RefundFailureCode | undefined
  try {
    await refundPaymentWorkflow(container).run({
      input: {
        payment_id: obligation.payment_id,
        amount: obligation.raw_amount.value,
        idempotency_key: obligation.idempotency_key,
        created_by: input.created_by,
      },
    })
  } catch (error) {
    failure = classifyRefundFailure(error)
    logCancellationUpstreamFailure(container, input.order_id)
  }
  const refund = await verifiedRefund(container, obligation)
  const outcome = refundOutcomeAfterAttempt(failure, !!refund)
  await service.updateRefundObligations({
    id: obligation.id,
    ...outcome,
    ...(refund && { refund_id: refund.id, succeeded_at: new Date() }),
  })
  return outcome.status
}
