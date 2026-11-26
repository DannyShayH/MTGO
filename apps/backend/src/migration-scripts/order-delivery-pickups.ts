import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryPickupsWorkflow } from "../workflows/delivery/order-pickup"

/**
 * Backfills pickups made before #254 onto the Order's kitchen record, so
 * the Restaurant sees collected Orders as picked up when this is deployed.
 * It runs the recovery sweep until a sweep records nothing; anything that
 * still fails stays owed for the `recover-order-delivery-pickups` job.
 */
export default async function backfillOrderDeliveryPickups({
  container,
}: {
  container: MedusaContainer
}) {
  while (true) {
    const { result } = await recoverOrderDeliveryPickupsWorkflow(container).run(
      { input: {} },
    )
    if (!result.recorded.length) break
  }
}
