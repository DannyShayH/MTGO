import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import {
  listRestaurantOrdersStep,
  retrieveRestaurantOrderStep,
} from "./steps/read-restaurant-orders"
import { acceptRestaurantOrderStep } from "./steps/accept-restaurant-order"
import { recordLegacyPlacementsStep } from "./steps/record-legacy-placements"
import { readOrderFeedStep } from "./steps/read-order-feed"
import type { AnnouncedRevisions } from "./order-feed"
import { cancelRestaurantOrderStep } from "./steps/cancel-restaurant-order"
import { settleOrderCancellationStep } from "./steps/settle-order-cancellation"
import { readOrderProgressStep } from "./steps/read-order-progress"
import { QueueView } from "./rules"

export type { RestaurantOrder } from "./steps/read-restaurant-orders"
export type { OrderProgress } from "./steps/read-order-progress"

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

/** Serializes transitions on one Order; the persisted revision guards the write. */
export const orderOperationLock = (order_id: string) => ({
  key: `order-operation:${order_id}`,
  timeout: 5,
  ttl: 30,
})

/**
 * Staff accept an awaiting Order strictly before its deadline (spec #47
 * stories 9, 10, 12-14). Actor, Restaurant and time come from the server.
 * Acceptance only records the commitment: it starts no preparation, assigns
 * no Delivery agent and leaves the native Order as it is.
 */
export const acceptPartnerOrderWorkflow = createWorkflow(
  "accept-partner-order",
  function (input: { staff_id: string; order_id: string }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const lock = transform({ input }, ({ input }) =>
      orderOperationLock(input.order_id),
    )
    acquireLockStep(lock)
    const command = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      order_id: input.order_id,
      staff_id: current.staff.id,
    }))
    acceptRestaurantOrderStep(command)
    releaseLockStep(lock)
    const scope = transform({ command }, ({ command }) => ({
      restaurant_id: command.restaurant_id,
      order_id: command.order_id,
    }))
    return new WorkflowResponse(
      retrieveRestaurantOrderStep(scope).config({
        name: "read-accepted-order",
      }),
    )
  },
)

/**
 * One tick of the kitchen feed (#148): staff authorization is checked against
 * the staff record before anything is published, then the Restaurant's
 * recently changed Order revisions are read from durable records and the
 * ones this connection has not announced yet become hints.
 */
export const readPartnerOrderFeedWorkflow = createWorkflow(
  "read-partner-order-feed",
  function (input: { staff_id: string; announced: AnnouncedRevisions }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const feedInput = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      announced: input.announced,
    }))
    return new WorkflowResponse(readOrderFeedStep(feedInput))
  },
)

/**
 * Staff reject an awaiting Order with an optional reason (spec #47 stories
 * 11, 13, 14, 32, 33; #143). Under the Order's lock the cancellation and its
 * full-refund obligation commit first; after the lock the refund is
 * attempted and native cancellation synchronized, and neither can reactivate
 * the Order. Only the request that cancelled settles, so a repeated or
 * competing rejection returns the recorded outcome without new effects.
 */
export const rejectPartnerOrderWorkflow = createWorkflow(
  "reject-partner-order",
  function (input: {
    staff_id: string
    order_id: string
    note: string | null
  }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const lock = transform({ input }, ({ input }) =>
      orderOperationLock(input.order_id),
    )
    acquireLockStep(lock)
    const command = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      order_id: input.order_id,
      staff_id: current.staff.id,
      note: input.note,
    }))
    const cancellation = cancelRestaurantOrderStep(command)
    releaseLockStep(lock)
    when(
      "settle-new-cancellation",
      { cancellation },
      ({ cancellation }) => cancellation.cancelled,
    ).then(() => {
      settleOrderCancellationStep(
        transform({ command, cancellation }, ({ command, cancellation }) => ({
          order_id: command.order_id,
          // The refund is credited to whoever the cancellation records.
          created_by: cancellation.cancelled_by ?? command.staff_id,
        })),
      )
    })
    const scope = transform({ command }, ({ command }) => ({
      restaurant_id: command.restaurant_id,
      order_id: command.order_id,
    }))
    return new WorkflowResponse(
      retrieveRestaurantOrderStep(scope).config({
        name: "read-rejected-order",
      }),
    )
  },
)

/**
 * The owning Customer's progress read (#143). The route's middleware has
 * already proven the Order is the Customer's placed Order.
 */
export const retrieveOrderProgressWorkflow = createWorkflow(
  "retrieve-order-progress",
  function (input: { order_id: string }) {
    return new WorkflowResponse(readOrderProgressStep(input))
  },
)

/** Idempotent: Orders that already have a record are left alone. */
export const recordLegacyPlacementsWorkflow = createWorkflow(
  "record-legacy-placements",
  function () {
    return new WorkflowResponse(recordLegacyPlacementsStep())
  },
)
