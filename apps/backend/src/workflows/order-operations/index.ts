import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import {
  listRestaurantOrdersStep,
  retrieveRestaurantOrderStep,
} from "./steps/read-restaurant-orders"
import { recordLegacyPlacementsStep } from "./steps/record-legacy-placements"
import { QueueView } from "./rules"

export type { RestaurantOrder } from "./steps/read-restaurant-orders"

/**
 * Staff read their own Restaurant's paid Orders (spec #47 stories 1-5). The
 * staff record is checked on every request, so revoked access stops reads.
 */
export const listPartnerOrdersWorkflow = createWorkflow(
  "list-partner-orders",
  function (input: {
    staff_id: string
    view: QueueView
    limit: number
    offset: number
  }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const page = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      view: input.view,
      limit: input.limit,
      offset: input.offset,
    }))
    return new WorkflowResponse(listRestaurantOrdersStep(page))
  },
)

export const retrievePartnerOrderWorkflow = createWorkflow(
  "retrieve-partner-order",
  function (input: { staff_id: string; order_id: string }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      order_id: input.order_id,
    }))
    return new WorkflowResponse(retrieveRestaurantOrderStep(scope))
  },
)

/** Idempotent: Orders that already have a record are left alone. */
export const recordLegacyPlacementsWorkflow = createWorkflow(
  "record-legacy-placements",
  function () {
    return new WorkflowResponse(recordLegacyPlacementsStep())
  },
)
