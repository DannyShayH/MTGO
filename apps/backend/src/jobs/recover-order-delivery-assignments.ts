import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryAssignmentsWorkflow } from "../workflows/delivery/order-assignment"

/**
 * Records assignments on the Order's kitchen record when the request that
 * made them could not (#259). It reads only durable records, so the first
 * tick after a worker starts is the startup reconciliation.
 */
export default async function recoverOrderDeliveryAssignments(
  container: MedusaContainer,
) {
  await recoverOrderDeliveryAssignmentsWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-order-delivery-assignments",
  schedule: "* * * * *",
}
