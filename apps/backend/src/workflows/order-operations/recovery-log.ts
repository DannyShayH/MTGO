import { createLogRecord } from "@dtc/logging"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Unexpected failure while recovering one Order's cancellation work (#144):
 * a `request.failed` record with the safe error classification, never
 * swallowed silently. The work stays in its durable record for the next
 * sweep, so recovery carries on with the other Orders.
 */
export function logRecoveryFailure(
  container: MedusaContainer,
  order_id: string,
  error: unknown,
) {
  const record = createLogRecord("backend", "request.failed", {
    order_id,
    err: error,
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .log(record.level, record.msg, record)
}
