import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryOutcomesWorkflow } from "../workflows/delivery/order-outcome"

/**
 * Backfills deliveries that ended before #204 onto the Order's kitchen
 * record, so delivered Orders leave In progress when this is deployed. It
 * runs the recovery sweep until a sweep records nothing; anything that still
 * fails stays owed for the `recover-order-delivery-outcomes` job.
 */
export default async function backfillOrderDeliveryOutcomes({
  container,
}: {
  container: MedusaContainer
}) {
  while (true) {
    const { result } = await recoverOrderDeliveryOutcomesWorkflow(
      container,
    ).run({ input: {} })
    if (!result.recorded.length) break
  }
}
