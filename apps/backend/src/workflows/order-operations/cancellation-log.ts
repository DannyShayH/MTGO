import type { MedusaContainer } from "@medusajs/framework/types"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"
import { logMilestone, milestoneActor } from "../../observability/milestone-log"

/**
 * The `order.cancelled` record of a cancellation that was just committed
 * (#247): the actor and the fixed category, never the note or reason. A
 * committed cancellation is never undone (ADR-0021), so it is logged at once.
 */
export function logOrderCancelled(
  container: MedusaContainer,
  cancellation: {
    order_id: string
    restaurant_id: string
    cancelled_by: string
    category: CancellationCategory
  },
) {
  const { cancelled_by, ...facts } = cancellation
  logMilestone(container, "order.cancelled", {
    ...facts,
    ...milestoneActor(cancelled_by),
  })
}
