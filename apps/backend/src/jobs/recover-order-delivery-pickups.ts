import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryPickupsWorkflow } from "../workflows/delivery/order-pickup"

/**
 * Records agents' pickups on the Order's kitchen record when the request
 * that recorded them could not (#254). It reads only durable records, so the
 * first tick after a worker starts is the startup reconciliation.
 */
export default async function recoverOrderDeliveryPickups(
  container: MedusaContainer,
) {
  await recoverOrderDeliveryPickupsWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-order-delivery-pickups",
  schedule: "* * * * *",
}
