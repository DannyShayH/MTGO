import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import { hasLegacyPlacementMarker } from "../../orders/placed-order-visibility"

type Row = {
  id: string
  metadata?: Record<string, unknown> | null
  restaurant?: { id: string } | null
  order_operation?: { id: string } | null
}

const PAGE = 200

/**
 * Orders are paged and their metadata marker checked in code: Order metadata
 * is not queryable, and this runs once per migration over a bounded table.
 *
 * Gives each Order placed before #140 its operational record. Only the
 * Restaurant link is evidence; the placement time is not, so the record has no
 * placement time or deadline rather than a fresh five-minute window.
 */
export const recordLegacyPlacementsStep = createStep(
  "record-legacy-placements",
  async (_: undefined, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const legacy: { order_id: string; restaurant_id: string }[] = []
    for (let skip = 0; ; skip += PAGE) {
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "metadata", "restaurant.id", "order_operation.id"],
        pagination: { skip, take: PAGE, order: { id: "ASC" } },
      })
      for (const order of data as unknown as Row[]) {
        if (
          hasLegacyPlacementMarker(order) &&
          order.restaurant &&
          !order.order_operation
        )
          legacy.push({
            order_id: order.id,
            restaurant_id: order.restaurant.id,
          })
      }
      if (data.length < PAGE) break
    }
    if (!legacy.length) return new StepResponse([] as string[], [] as string[])
    const created = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .createOrderOperations(
        legacy.map((row) => ({
          ...row,
          placed_at: null,
          acceptance_deadline: null,
        })),
      )
    const ids = created.map(({ id }) => id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) return
    await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .deleteOrderOperations(ids)
  },
)
