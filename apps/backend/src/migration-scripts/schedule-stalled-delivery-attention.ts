import type { MedusaContainer } from "@medusajs/framework/types"
import { backfillDeliveryAttention } from "../workflows/delivery/attention"

/**
 * Schedule stalled-work attention for work assigned before #163, from its
 * recorded acceptance or pickup time; safe to repeat. The next sweep raises
 * what is due. Ended work is skipped.
 */
export default async function scheduleStalledDeliveryAttention({
  container,
}: {
  container: MedusaContainer
}) {
  await backfillDeliveryAttention(container, {
    assigned_agent_id: { $ne: null },
    terminal_outcome: null,
  })
}
