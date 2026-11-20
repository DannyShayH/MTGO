import type { MedusaContainer } from "@medusajs/framework/types"
import { backfillDeliveryAttention } from "../workflows/delivery/attention"

/**
 * Schedule unassigned attention for work accepted before #158, from its
 * recorded acceptance time; safe to repeat. The next sweep raises what is due.
 */
export default async function scheduleDeliveryAttention({
  container,
}: {
  container: MedusaContainer
}) {
  await backfillDeliveryAttention(container, { assigned_agent_id: null })
}
