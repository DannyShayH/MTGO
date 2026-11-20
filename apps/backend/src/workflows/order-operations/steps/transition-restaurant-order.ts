import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import { withResponseFields } from "../../common/response-fields"
import {
  decideTransition,
  ORDER_CHANGED,
  ORDER_TRANSITIONS,
  MilestoneAction,
  TransitionFacts,
  TransitionRefusal,
} from "../rules"
import { orderNotFound, readRestaurantOrder } from "./read-restaurant-orders"
import { commitUnassignedCancellation } from "../unassigned-cancellation"

export type TransitionRestaurantOrderInput = {
  restaurant_id: string
  order_id: string
  staff_id: string
  action: MilestoneAction
}

type Compensation = {
  id: string
  action: MilestoneAction
  revision: number
  staff_id: string
}

type Guarded = TransitionFacts & { id: string; revision: number }

/**
 * A refusal carries the Order as it is now, so the screen can show the
 * outcome. The Order's state refuses with `NOT_ALLOWED`; a change between the
 * guarded read and the write is a `CONFLICT`.
 */
async function refuseWithCurrent(
  container: MedusaContainer,
  input: TransitionRestaurantOrderInput,
  code: TransitionRefusal | typeof ORDER_CHANGED,
) {
  const current = await readRestaurantOrder(container, input)
  const type =
    code === ORDER_CHANGED
      ? MedusaError.Types.CONFLICT
      : MedusaError.Types.NOT_ALLOWED
  return withResponseFields(new MedusaError(type, code, code), current)
}

/**
 * The shared guarded transition (spec #47): accept, start preparation or mark
 * food ready. The Order's lock serializes it: it re-reads the record, decides
 * at the server's current time and commits state, revision, milestone time
 * and actor in one update whose selector repeats the revision and state it
 * read. If they no longer match, nothing is written and the request is
 * refused with `order_changed`. A recorded milestone is returned unchanged
 * rather than repeated.
 *
 * Compensation undoes only the write this step made: it restores the
 * previous state under a newer revision, guarded by the revision, state and
 * actor it wrote, so it never reverts a later transition or a repeat.
 */
export const transitionRestaurantOrderStep = createStep(
  "transition-restaurant-order",
  async (input: TransitionRestaurantOrderInput, { container }) => {
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
          "preparation_started_at",
          "ready_at",
          "revision",
        ],
        take: 1,
      },
    )) as unknown as Guarded[]
    if (!record) throw orderNotFound()
    const now = new Date()
    // Work still unassigned at its claim deadline is cancelled first, under
    // this same guard, so no kitchen milestone (or food credit) is recorded
    // after the cutoff, even before the sweep runs (#162). The sweep settles
    // the refund on its next tick.
    if (
      input.action !== "accept" &&
      (
        await commitUnassignedCancellation(container, {
          order_id: input.order_id,
          now,
        })
      ).outcome === "cancelled"
    )
      throw await refuseWithCurrent(container, input, "order_cancelled")
    const decision = decideTransition(input.action, record, now)
    if (decision.outcome === "refused")
      throw await refuseWithCurrent(container, input, decision.code)
    if (decision.outcome === "already_recorded")
      return new StepResponse<void, Compensation>(undefined)
    const { from, to, at, by } = ORDER_TRANSITIONS[input.action]
    const updated = await service.updateOrderOperations({
      selector: { id: record.id, revision: record.revision, state: from },
      data: {
        state: to,
        [at]: now,
        [by]: input.staff_id,
        revision: record.revision + 1,
      },
    })
    if (!updated.length)
      throw await refuseWithCurrent(container, input, ORDER_CHANGED)
    return new StepResponse<void, Compensation>(undefined, {
      id: record.id,
      action: input.action,
      revision: record.revision,
      staff_id: input.staff_id,
    })
  },
  async (written: Compensation, { container }) => {
    if (!written) return
    const { from, to, at, by } = ORDER_TRANSITIONS[written.action]
    await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .updateOrderOperations({
        selector: {
          id: written.id,
          revision: written.revision + 1,
          state: to,
          [by]: written.staff_id,
        },
        // Undoing is a persisted change too: a newer revision, so the kitchen
        // feed (#148) announces it instead of leaving screens on the undone
        // milestone.
        data: {
          state: from,
          [at]: null,
          [by]: null,
          revision: written.revision + 2,
        },
      })
  },
)
