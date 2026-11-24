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
import {
  readOrderProgressStep,
  readOrderTrackingStep,
} from "./steps/read-order-progress"
import {
  cancelLegacyAwaitingOrdersStep,
  type LegacyCancellationInput,
} from "./steps/cancel-legacy-awaiting-orders"
import { MilestoneAction, QueueFilters, QueueView } from "./rules"
import { orderOperationLock } from "./locks"
import {
  listOpenRefundsStep,
  retryFullRefundStep,
} from "./steps/operator-refunds"
import type { ListOpenRefundsInput } from "./refunds"
import {
  commitOperatorCancellationStep,
  previewOperatorCancellationStep,
  readOperatorCancellationStep,
} from "./steps/cancel-accepted-order"
import type { OperatorCancellationRequest } from "./operator-cancellation"
import { recordDeliveryEndOnOrderStep } from "../delivery/order-outcome"
import {
  recoverOrderOperationsStep,
  type RecoveryInput,
} from "./steps/recover-order-operations"

export type { RestaurantOrder } from "./steps/read-restaurant-orders"
export type { OrderProgress } from "./steps/read-order-progress"
export type { OperatorRefund } from "./refunds"
export type { OperatorCancellationView } from "./steps/cancel-accepted-order"

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
    display_id?: number
    filters: QueueFilters
  }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const page = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      view: input.view,
      limit: input.limit,
      offset: input.offset,
      display_id: input.display_id,
      filters: input.filters,
    }))
    return new WorkflowResponse(listRestaurantOrdersStep(page))
  },
)

/**
 * One of the staff member's Restaurant's Orders. With the Restaurant
 * statements flag on (the route decides, ADR-0022), it also carries the
 * Order's purchased financial basis (#226); off, the field is absent.
 */
export const retrievePartnerOrderWorkflow = createWorkflow(
  "retrieve-partner-order",
  function (input: {
    staff_id: string
    order_id: string
    include_financial_basis?: boolean
  }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      restaurant_id: current.restaurant.id,
      order_id: input.order_id,
      include_financial_basis: !!input.include_financial_basis,
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

export const retrieveOrderTrackingWorkflow = createWorkflow(
  "retrieve-order-tracking",
  function (input: { order_id: string }) {
    return new WorkflowResponse(readOrderTrackingStep(input))
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

/**
 * The operator's Refunds page (#198): Orders whose full refund is failed or
 * pending, failed first and longest owed first, with the attempt history.
 */
export const listOpenRefundsWorkflow = createWorkflow(
  "list-open-refunds",
  function (input: ListOpenRefundsInput) {
    return new WorkflowResponse(listOpenRefundsStep(input))
  },
)

/**
 * An operator retries a failed full refund (#198) through the one existing
 * attempt, under the Order's settlement lock, as the attempt's actor.
 */
export const retryFullRefundWorkflow = createWorkflow(
  "retry-full-refund",
  function (input: { order_id: string; actor_id: string }) {
    return new WorkflowResponse(retryFullRefundStep(input))
  },
)

/**
 * An operator cancels an accepted, unfinished Order with a full refund
 * (#199; spec #49 stories 25-42). Under the Order's guard the cancellation,
 * the full-refund obligation and any prepared-food credit commit together and
 * the delivery ends as `cancelled`. Only the request that cancelled settles:
 * the refund attempt as the operator's, then native cancellation, then the
 * delivery's end is recorded on the kitchen record (#204). A repeat returns
 * the recorded outcome without new effects.
 */
export const cancelAcceptedOrderWorkflow = createWorkflow(
  "cancel-accepted-order",
  function (input: Omit<OperatorCancellationRequest, "now">) {
    const cancellation = commitOperatorCancellationStep(input)
    const order = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
    }))
    when(
      "settle-operator-cancellation",
      { cancellation },
      ({ cancellation }) => cancellation.cancelled,
    ).then(() => {
      const settled = settleOrderCancellationStep(
        transform({ order, cancellation }, ({ order, cancellation }) => ({
          ...order,
          attempted_by: cancellation.cancelled_by as string,
        })),
      ).config({ name: "settle-operator-cancellation-effects" })
      recordDeliveryEndOnOrderStep(
        // `settled` only orders the record after the settlement.
        transform({ order, settled }, ({ order }) => order),
      )
    })
    return new WorkflowResponse(
      readOperatorCancellationStep(
        transform({ order, cancellation }, ({ order, cancellation }) => ({
          ...order,
          cancelled_now: cancellation.cancelled,
        })),
      ),
    )
  },
)

/** The amount the operator's confirmation shows before cancelling (#199). */
export const previewOperatorCancellationWorkflow = createWorkflow(
  "preview-operator-cancellation",
  function (input: { order_id: string }) {
    return new WorkflowResponse(previewOperatorCancellationStep(input))
  },
)
