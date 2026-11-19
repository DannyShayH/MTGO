import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { PLACEMENT_MARKER_KEY } from "../../orders/placed-order-visibility"

type Marking = { order_id: string; order_operation_id: string }

/**
 * Copies each placement record's id onto its Order, so Order lists can filter
 * on placement (#154). Medusa merges metadata, so the compensation removes
 * the key with an empty string. The core `updateOrdersStep` compensation
 * cannot do that: it writes back the old metadata, which keeps the new key.
 */
export const markPaidPlacementsStep = createStep(
  "mark-paid-placements",
  async (markings: Marking[], { container }) => {
    if (!markings.length) return new StepResponse(undefined, [] as string[])
    await container.resolve(Modules.ORDER).updateOrders(
      markings.map(({ order_id, order_operation_id }) => ({
        id: order_id,
        metadata: { [PLACEMENT_MARKER_KEY]: order_operation_id },
      })),
    )
    return new StepResponse(
      undefined,
      markings.map(({ order_id }) => order_id),
    )
  },
  async (orderIds, { container }) => {
    if (!orderIds?.length) return
    await container.resolve(Modules.ORDER).updateOrders(
      orderIds.map((id) => ({
        id,
        metadata: { [PLACEMENT_MARKER_KEY]: "" },
      })),
    )
  },
)
