import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderDeliveryAssignmentsWorkflow } from "../workflows/delivery/order-assignment"

/**
 * Backfills assignments made before #259 onto the Order's kitchen record,
 * so Open Orders by stage tell assigned from unassigned work when this is
 * deployed. It runs the recovery sweep until a sweep records nothing;
 * anything that still fails stays owed for the
 * `recover-order-delivery-assignments` job.
 */
export default async function backfillOrderDeliveryAssignments({
  container,
}: {
  container: MedusaContainer
}) {
  while (true) {
    const { result } = await recoverOrderDeliveryAssignmentsWorkflow(
      container,
    ).run({ input: {} })
    if (!result.recorded.length) break
  }
}
