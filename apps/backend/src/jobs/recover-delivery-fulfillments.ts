import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverDeliveryFulfillmentsWorkflow } from "../workflows/delivery/native-fulfillment"

/**
 * Finishes native fulfillment owed by recorded pickups (#160) and handovers
 * (#161). It reads only durable records, so the first tick after a worker
 * starts is the startup reconciliation.
 */
export default async function recoverDeliveryFulfillments(
  container: MedusaContainer,
) {
  await recoverDeliveryFulfillmentsWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-delivery-fulfillments",
  schedule: "* * * * *",
}
