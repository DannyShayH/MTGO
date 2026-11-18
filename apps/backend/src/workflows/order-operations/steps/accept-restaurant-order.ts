import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type { OrderOperationState } from "../../../modules/order-operation/models/order-operation"
import { withResponseFields } from "../../common/response-fields"
import { AcceptanceRefusal, decideAcceptance, ORDER_CHANGED } from "../rules"
import { orderNotFound, readRestaurantOrder } from "./read-restaurant-orders"

type Input = { restaurant_id: string; order_id: string; staff_id: string }

type Compensation = { id: string; revision: number; staff_id: string }

type Guarded = {
  id: string
  state: OrderOperationState
  acceptance_deadline: Date | null
  accepted_at: Date | null
  revision: number
}

/**
 * A refusal carries the Order as it is now, so the screen can show the
 * outcome. The Order's state refuses with `NOT_ALLOWED`; a change between the
 * guarded read and the write is a `CONFLICT`.
 */
async function refuseWithCurrent(
  container: MedusaContainer,
  input: Input,
  code: AcceptanceRefusal | typeof ORDER_CHANGED,
) {
  const current = await readRestaurantOrder(container, input)
  const type =
    code === ORDER_CHANGED
      ? MedusaError.Types.CONFLICT
      : MedusaError.Types.NOT_ALLOWED
  return withResponseFields(new MedusaError(type, code, code), current)
}

/**
 * The guarded transition (spec #47). The Order's lock serializes it: it
 * re-reads the record, decides at the server's current time and commits
 * state, revision, time and actor in one update whose selector repeats the
 * revision and state it read. If they no longer match, nothing is written and
 * the request is refused with `order_changed`. A recorded acceptance is
 * returned unchanged rather than repeated.
 *
 * Compensation undoes only the write this step made: it restores the
 * awaiting state and the revision it read, guarded by the revision and actor
 * it wrote, so it never reverts a later transition or a repeated acceptance.
 */
export const acceptRestaurantOrderStep = createStep(
  "accept-restaurant-order",
  async (input: Input, { container }) => {
    const service = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const [record] = (await service.listOrderOperations(
      { order_id: input.order_id, restaurant_id: input.restaurant_id },
      {
        select: [
          "id",
          "state",
          "acceptance_deadline",
          "accepted_at",
          "revision",
        ],
        take: 1,
      },
    )) as unknown as Guarded[]
    if (!record) throw orderNotFound()
    const now = new Date()
    const decision = decideAcceptance(record, now)
    if (decision.outcome === "refused")
      throw await refuseWithCurrent(container, input, decision.code)
    if (decision.outcome === "already_accepted")
      return new StepResponse<void, Compensation>(undefined)
    const updated = await service.updateOrderOperations({
      selector: {
        id: record.id,
        revision: record.revision,
        state: "awaiting_acceptance",
      },
      data: {
        state: "accepted",
        accepted_at: now,
        accepted_by: input.staff_id,
        revision: record.revision + 1,
      },
    })
    if (!updated.length)
      throw await refuseWithCurrent(container, input, ORDER_CHANGED)
    return new StepResponse<void, Compensation>(undefined, {
      id: record.id,
      revision: record.revision,
      staff_id: input.staff_id,
    })
  },
  async (written: Compensation, { container }) => {
    if (!written) return
    const service = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    await service.updateOrderOperations({
      selector: {
        id: written.id,
        revision: written.revision + 1,
        state: "accepted",
        accepted_by: written.staff_id,
      },
      data: {
        state: "awaiting_acceptance",
        accepted_at: null,
        accepted_by: null,
        revision: written.revision,
      },
    })
  },
)
