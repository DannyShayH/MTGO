import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverDeliveryPickupsWorkflow } from "../workflows/delivery/pickup"

/**
 * Finishes native fulfillment owed by recorded pickups (#160). It reads only
 * durable records, so the first tick after a worker starts is the startup
 * reconciliation.
 */
export default async function recoverDeliveryPickups(
  container: MedusaContainer,
) {
  await recoverDeliveryPickupsWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-delivery-pickups",
  schedule: "* * * * *",
}
