import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryOutcomesWorkflow } from "../workflows/delivery/order-outcome"

/**
 * Records ended deliveries on the Order's kitchen record when the request
 * that ended them could not (#204). It reads only durable records, so the
 * first tick after a worker starts is the startup reconciliation.
 */
export default async function recoverOrderDeliveryOutcomes(
  container: MedusaContainer,
) {
  await recoverOrderDeliveryOutcomesWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-order-delivery-outcomes",
  schedule: "* * * * *",
}
