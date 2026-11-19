import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverDeliveryAttentionWorkflow } from "../workflows/delivery/attention"

/**
 * Raises and resolves operator attention from durable obligations (#158).
 * The first tick after a worker starts is the startup reconciliation; each
 * tick is bounded, and nothing depends on an in-memory timer.
 */
export default async function recoverDeliveryAttention(
  container: MedusaContainer,
) {
  await recoverDeliveryAttentionWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-delivery-attention",
  schedule: "* * * * *",
}
