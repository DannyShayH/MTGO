import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { scheduleDeliveryAttentionWorkflow } from "../workflows/delivery/attention"

/**
 * Schedule unassigned attention for work accepted before #158, from its
 * recorded acceptance time; safe to repeat. The next sweep raises what is due.
 */
export default async function scheduleDeliveryAttention({
  container,
}: {
  container: MedusaContainer
}) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  let offset = 0
  while (true) {
    const batch = await delivery.listIntendedDeliveries(
      { assigned_agent_id: null },
      { select: ["order_id"], order: { id: "ASC" }, take: 100, skip: offset },
    )
    for (const { order_id } of batch)
      await scheduleDeliveryAttentionWorkflow(container).run({
        input: { order_id },
      })
    if (batch.length < 100) break
    offset += batch.length
  }
}
