import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { OPEN_ORDER_STAGES } from "../../modules/order-operation/service"
import {
  attentionFigure,
  fullRefundFigure,
  unassignedDeliveriesFigure,
  unassignedWaitingCutoff,
} from "./work-waiting"

/** The whole platform, or one Restaurant's own figures. */
export type OperationsScope =
  { type: "platform" } | { type: "restaurant"; restaurant_id: string }

export type OperationsInput = {
  scope: OperationsScope
  /** The one moment every measure is calculated for, as ISO text. */
  now: string
}

/** The scope as a module filter: one Restaurant's records, or all. */
const restaurantFilter = (scope: OperationsScope) =>
  scope.type === "restaurant" ? { restaurant_id: scope.restaurant_id } : {}

const readOpenOrdersStep = createStep(
  "read-open-orders",
  async (input: OperationsInput, { container }) => {
    const counts = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .countOpenOrdersByStage(restaurantFilter(input.scope))
    const stages = OPEN_ORDER_STAGES.map((stage) => ({
      stage,
      count: counts[stage],
    }))
    const as_of = new Date(input.now).toISOString()
    return new StepResponse({
      as_of,
      scope: input.scope,
      open_orders: {
        // A state at one moment, not a range of time.
        period: { at: as_of },
        total: stages.reduce((sum, { count }) => sum + count, 0),
        stages,
        // Being open needs no recorded time, so no Order is left out.
        exclusions: [],
      },
    })
  },
)

/**
 * Unassigned deliveries and outstanding attention (#260), both from the
 * delivery module with the one ten-minute cutoff derived from `now`, so the
 * overlap they mark names the same Orders.
 */
const readDeliveryWorkStep = createStep(
  "read-delivery-work",
  async (input: OperationsInput, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const now = new Date(input.now)
    const filter = {
      waiting_before: unassignedWaitingCutoff(now),
      ...restaurantFilter(input.scope),
    }
    const [unassigned, attention] = await Promise.all([
      delivery.countUnassignedDeliveries(filter),
      delivery.countOutstandingAttentionByType(filter),
    ])
    const at = now.toISOString()
    return new StepResponse({
      unassigned_deliveries: unassignedDeliveriesFigure(unassigned, at),
      attention: attentionFigure(attention, at),
    })
  },
)

/** Full refunds still owed (#260), pending apart from failed. */
const readFullRefundsStep = createStep(
  "read-full-refunds",
  async (input: OperationsInput, { container }) => {
    const counts = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .countUnresolvedFullRefunds(restaurantFilter(input.scope))
    return new StepResponse(
      fullRefundFigure(counts, new Date(input.now).toISOString()),
    )
  },
)

/**
 * The operations read (#54), the only entry point for the operator and
 * staff views. It takes a scope and one explicit `now` and derives every
 * period from it, so each response states the moment it describes. Each
 * owning module aggregates its own records in the database; this workflow
 * only combines them. #259 adds Open Orders by stage; #260 adds unassigned
 * deliveries, attention by type and unresolved Full refunds.
 */
export const readOperationsWorkflow = createWorkflow(
  "read-operations",
  function (input: OperationsInput) {
    const open = readOpenOrdersStep(input)
    const work = readDeliveryWorkStep(input)
    const fullRefunds = readFullRefundsStep(input)
    return new WorkflowResponse(
      transform({ open, work, fullRefunds }, ({ open, work, fullRefunds }) => ({
        ...open,
        ...work,
        full_refunds: fullRefunds,
      })),
    )
  },
)
