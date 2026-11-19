import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { PLACEMENT_MARKER_KEY } from "../../orders/placed-order-visibility"
import { orderOperationsOf } from "../purchased-items"

const PAGE = 200

/**
 * Placement records whose Order lacks the placement marker: Orders placed
 * before #154. Read-only and paged by record, so it runs once per migration
 * without loading every Order at once.
 */
export const findUnmarkedPlacementsStep = createStep(
  "find-unmarked-placements",
  async (_: undefined, { container }) => {
    const orders = container.resolve(Modules.ORDER)
    const unmarked: { order_id: string; order_operation_id: string }[] = []
    for (let skip = 0; ; skip += PAGE) {
      const records = await orderOperationsOf(container).listOrderOperations(
        {},
        { select: ["id", "order_id"], skip, take: PAGE, order: { id: "ASC" } },
      )
      if (records.length) {
        const marked = new Set(
          (
            await orders.listOrders(
              { id: records.map(({ order_id }) => order_id) },
              { select: ["id", "metadata"] },
            )
          )
            .filter(({ metadata }) => metadata?.[PLACEMENT_MARKER_KEY])
            .map(({ id }) => id),
        )
        for (const { id, order_id } of records)
          if (!marked.has(order_id))
            unmarked.push({ order_id, order_operation_id: id })
      }
      if (records.length < PAGE) break
    }
    return new StepResponse(unmarked)
  },
)
