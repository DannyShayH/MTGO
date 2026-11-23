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
import { transitionRestaurantOrderStep } from "./steps/transition-restaurant-order"
import { establishIntendedDeliveryStep } from "../delivery/available"
import { measureTripStep } from "../delivery/trip"
import { recordLegacyPlacementsStep } from "./steps/record-legacy-placements"
import { findUnmarkedPlacementsStep } from "./steps/find-unmarked-placements"
import { markPaidPlacementsStep } from "./steps/mark-paid-placements"
import { readOrderFeedStep } from "./steps/read-order-feed"
import type { AnnouncedRevisions } from "./order-feed"
import { cancelRestaurantOrderStep } from "./steps/cancel-restaurant-order"
import { settleOrderCancellationStep } from "./steps/settle-order-cancellation"
import { cancelCustomerOrderStep } from "./steps/cancel-customer-order"
import { readOrderProgressStep } from "./steps/read-order-progress"
import {
  cancelLegacyAwaitingOrdersStep,
  type LegacyCancellationInput,
} from "./steps/cancel-legacy-awaiting-orders"
import { MilestoneAction, QueueView } from "./rules"
import { orderOperationLock } from "./locks"
import {
  recoverOrderOperationsStep,
  type RecoveryInput,
} from "./steps/recover-order-operations"

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

/**
 * One guarded kitchen milestone after acceptance, run under the Order's lock
 * with the same transition step as acceptance. Actor, Restaurant and time come
 * from the server; the staff record is checked first, so revoked access stops
 * further actions. Unlike acceptance, it establishes no intended delivery.
 */
const createPartnerOrderTransitionWorkflow = (
  name: string,
  action: Exclude<MilestoneAction, "accept">,
) =>
  createWorkflow(
    name,
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
        action,
      }))
      transitionRestaurantOrderStep(command)
      releaseLockStep(lock)
      const scope = transform({ command }, ({ command }) => ({
        restaurant_id: command.restaurant_id,
        order_id: command.order_id,
      }))
      return new WorkflowResponse(
        retrieveRestaurantOrderStep(scope).config({
          name: "read-transitioned-order",
        }),
      )
    },
  )

/**
 * Staff accept an awaiting Order strictly before its deadline (spec #47
 * stories 9, 10, 12-14). Acceptance only records the commitment: it starts no
 * preparation, assigns no Delivery agent and leaves the native Order as it is.
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
      action: "accept" as const,
    }))
    transitionRestaurantOrderStep(command)
    const delivery = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
    }))
    establishIntendedDeliveryStep(delivery)
    releaseLockStep(lock)
    // Outside the lock: the provider never holds acceptance up (#191).
    measureTripStep(delivery)
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
 * Staff record that preparation started on an accepted Order (spec #47
 * stories 15, 16). It does not wait for, or create, a Delivery assignment.
 */
export const startPartnerOrderPreparationWorkflow =
  createPartnerOrderTransitionWorkflow(
    "start-partner-order-preparation",
    "start_preparation",
  )

/**
 * Staff record that the food is ready, only after preparation started (spec
 * #47 stories 17, 18). Readiness is not pickup, delivery or native completion.
 */
export const markPartnerOrderReadyWorkflow =
  createPartnerOrderTransitionWorkflow("mark-partner-order-ready", "ready")

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
          attempted_by: cancellation.cancelled_by as string,
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

/**
 * The owning Customer cancels an awaiting Order before acceptance (#145; spec
 * #47 stories 27, 29, 30, 32, 33, 42), through the same lock, guarded commit
 * and settlement as staff rejection: the cancellation and its full-refund
 * obligation commit first, then the refund is attempted and native
 * cancellation synchronized. Only the request that cancelled settles, so a
 * double tap or lost response returns the recorded outcome. The route's
 * middleware has already proven the Order is the Customer's placed Order.
 */
export const cancelCustomerOrderWorkflow = createWorkflow(
  "cancel-customer-order",
  function (input: { customer_id: string; order_id: string }) {
    const lock = transform({ input }, ({ input }) =>
      orderOperationLock(input.order_id),
    )
    acquireLockStep(lock)
    const cancellation = cancelCustomerOrderStep(input)
    releaseLockStep(lock)
    const order = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
    }))
    when(
      "settle-customer-cancellation",
      { cancellation },
      ({ cancellation }) => cancellation.cancelled,
    ).then(() => {
      settleOrderCancellationStep(
        transform({ order, cancellation }, ({ order, cancellation }) => ({
          ...order,
          attempted_by: cancellation.cancelled_by as string,
        })),
      ).config({
        name: "settle-customer-cancellation-effects",
      })
    })
    return new WorkflowResponse(
      readOrderProgressStep(order).config({
        name: "read-cancelled-order-progress",
      }),
    )
  },
)

/** Idempotent: Orders that already have a record are left alone. */
export const recordLegacyPlacementsWorkflow = createWorkflow(
  "record-legacy-placements",
  function () {
    return new WorkflowResponse(recordLegacyPlacementsStep())
  },
)

/** Idempotent: copies each placement record's id onto an Order still without it (#154). */
export const markRecordedPlacementsWorkflow = createWorkflow(
  "mark-recorded-placements",
  function () {
    markPaidPlacementsStep(findUnmarkedPlacementsStep())
    return new WorkflowResponse(undefined)
  },
)

/**
 * The one recovery capability (#144), run by the scheduled job on every
 * worker tick and therefore first right after a worker starts: it expires
 * due awaiting Orders and resumes unfinished cancellation and refund work
 * from durable records. Safe to repeat and to run beside live requests.
 */
export const recoverOrderOperationsWorkflow = createWorkflow(
  "recover-order-operations",
  function (input: RecoveryInput) {
    return new WorkflowResponse(recoverOrderOperationsStep(input))
  },
)

/**
 * Operator-run cleanup of legacy Orders still awaiting acceptance (Orders
 * placed before this module, with no deadline): each is cancelled as the
 * system's timeout with a full refund through the shared engine. Run it
 * with `src/scripts/cancel-legacy-awaiting-orders.ts`; `apply: false` only
 * lists them.
 */
export const cancelLegacyAwaitingOrdersWorkflow = createWorkflow(
  "cancel-legacy-awaiting-orders",
  function (input: LegacyCancellationInput) {
    return new WorkflowResponse(cancelLegacyAwaitingOrdersStep(input))
  },
)
