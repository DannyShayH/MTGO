import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { establishIntendedDeliveryWorkflow } from "../workflows/delivery/available"

/** Backfill accepted work when this slice is deployed; safe on every db:migrate. */
export default async function establishIntendedDeliveries({
  container,
}: {
  container: MedusaContainer
}) {
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  let offset = 0
  let unavailable = 0
  while (true) {
    const batch = await operations.listOrderOperations(
      { accepted_at: { $ne: null } },
      { select: ["order_id"], order: { id: "ASC" }, take: 100, skip: offset },
    )
    for (const { order_id } of batch) {
      const { result } = await establishIntendedDeliveryWorkflow(container).run(
        { input: { order_id } },
      )
      if (!result) unavailable += 1
    }
    if (batch.length < 100) break
    offset += batch.length
  }
  if (unavailable)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        "Some accepted Orders lack reliable delivery facts and remain unavailable for claiming",
      )
}
