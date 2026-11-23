import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelLegacyAwaitingOrdersWorkflow } from "../workflows/order-operations"

const APPLY = "apply"

/**
 * Ends legacy Orders still awaiting acceptance ("Timing unknown"): Orders
 * placed before the Order Operations module, which no rule can time out.
 * Each is cancelled as the system's timeout with a full refund through the
 * shared engine, so its refund and history are recorded like any other.
 *
 * Without arguments it only lists them. Pass `apply` to cancel and refund:
 *
 *   npx medusa exec ./src/scripts/cancel-legacy-awaiting-orders.ts
 *   npx medusa exec ./src/scripts/cancel-legacy-awaiting-orders.ts apply
 *
 * Safe to repeat: an Order already ended is not found again.
 */
export default async function cancelLegacyAwaitingOrders({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apply = args?.includes(APPLY) ?? false
  const { result } = await cancelLegacyAwaitingOrdersWorkflow(container).run({
    input: { apply },
  })
  logger.info(
    `Legacy awaiting Orders found: ${result.found.length}` +
      (result.found.length ? ` (${result.found.join(", ")})` : ""),
  )
  if (!apply) {
    logger.info(
      `Dry run: nothing changed. Pass "${APPLY}" to cancel and refund them.`,
    )
    return
  }
  logger.info(`Cancelled with a full refund: ${result.cancelled.length}`)
  const left = result.found.filter((id) => !result.cancelled.includes(id))
  if (left.length)
    logger.warn(
      `Not cancelled (changed meanwhile or failed, see the log above): ${left.join(", ")}`,
    )
}
