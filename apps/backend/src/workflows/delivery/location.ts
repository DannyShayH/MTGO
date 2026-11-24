import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import type { MeasuredPosition } from "../../modules/delivery/service"
import { customerLocation, customerLocationSample } from "./customer-location"
import { iso } from "../order-operations/outcomes"
import {
  DELIVERY_PROGRESS_FIELDS,
  deliveryProgressOf,
  type DeliveryProgress,
} from "../order-operations/steps/read-order-progress"
import {
  deliveryNotFound,
  deliveryRefusal,
  underDeliveryGuard,
} from "./delivery-guard"
import {
  decideLocationSample,
  LOCATION_CONFLICTS,
  type DeliveryLocationView,
} from "./location-rules"

/** One sample from the phone; the agent comes from authentication. */
export type LocationSampleInput = MeasuredPosition & {
  order_id: string
  agent_id: string
  /** When the phone measured the position (ISO time). */
  observed_at: string
}

/** What the agent's phone learns: whether the sample was kept, and the kept times. */
export type SharedLocationResponse = {
  location: {
    accepted: boolean
    observed_at: string | null
    received_at: string | null
  }
  server_time: string
}

type SampleUndo = Parameters<DeliveryModuleService["restoreLocation"]>[0]

/**
 * Replaces the latest location under the agent's capacity key and the
 * Order's guard, the order handover and termination take them, so a sample
 * racing the terminal outcome is stored before it (and deleted by it) or
 * refused. Freshness is decided at the server's time taken under them.
 *
 * A sample is not a business milestone, so the step keeps its compensation
 * (ADR-0021): it brings back the replaced sample, only while the kept one is
 * still this write's, so it never restores a coordinate after the delivery
 * ended. This workflow is not stored and Medusa's checkpoints keep no step
 * data, so the coordinate exists only in the one `DeliveryLocation` row.
 */
export const recordDeliveryLocationStep = createStep(
  "record-delivery-location",
  async (input: LocationSampleInput, { container }) => {
    const result = await underDeliveryGuard(
      container,
      input,
      ({ order_active, now }) =>
        container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .recordLocation(
            {
              ...input,
              observed_at: new Date(input.observed_at),
              order_active,
              now,
            },
            decideLocationSample,
          )
          .then((recorded) => ({ ...recorded, now })),
    )
    const { outcome } = result
    // A newer sample written while this one was decided wins the race.
    if (outcome.outcome === "superseded")
      throw deliveryRefusal("location_out_of_order", LOCATION_CONFLICTS)
    if (outcome.outcome === "refused")
      throw outcome.code === "delivery_not_responsible"
        ? // Another agent's or unassigned work answers like a missing
          // delivery, so the route never reveals that an Order has one.
          deliveryNotFound()
        : deliveryRefusal(outcome.code, LOCATION_CONFLICTS)
    const isAccepted = outcome.outcome === "record"
    const response: SharedLocationResponse = {
      location: {
        accepted: isAccepted,
        observed_at: iso(result.location?.observed_at ?? null),
        received_at: iso(result.location?.received_at ?? null),
      },
      server_time: result.now.toISOString(),
    }
    const undo: SampleUndo | null =
      isAccepted && result.location
        ? {
            order_id: input.order_id,
            revision: result.location.revision,
            previous: result.previous ?? null,
          }
        : null
    return new StepResponse(response, undo)
  },
  async (undo: SampleUndo | null, { container }) => {
    if (!undo) return
    await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .restoreLocation(undo)
  },
)

/**
 * The responsible agent shares the phone's position during transit (#166;
 * spec #48 stories 51-54). Only the latest sample is kept.
 */
export const shareDeliveryLocationWorkflow = createWorkflow(
  "share-delivery-location",
  function (input: LocationSampleInput) {
    return new WorkflowResponse(recordDeliveryLocationStep(input))
  },
)

/**
 * What the ordering Customer sees of the delivery (#166; spec #48 stories
 * 55-59, 64), for #50: the committed milestones, as in the progress
 * projection, and the latest location with its freshness. `revision` counts
 * the kept samples, so a consumer can tell a replaced sample from a repeated
 * read; it is `null` without one. Never the agent's identity, retry
 * identities, internal notes or another Order's data.
 */
export type OrderDeliveryView = {
  delivery:
    | (NonNullable<DeliveryProgress> & {
        location: DeliveryLocationView & { revision: number | null }
      })
    | null
  server_time: string
}

/** Read fresh on every request: the route marks it uncacheable. */
export const readOrderDeliveryStep = createStep(
  "read-order-delivery",
  async (input: { order_id: string }, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [record] = await delivery.listIntendedDeliveries(
      { order_id: input.order_id },
      { select: DELIVERY_PROGRESS_FIELDS, take: 1 },
    )
    const sample = record
      ? await customerLocationSample(delivery, input.order_id)
      : null
    const now = new Date()
    const view: OrderDeliveryView = {
      delivery: record
        ? {
            ...deliveryProgressOf(record),
            location: customerLocation(record, sample ?? null, now),
          }
        : null,
      server_time: now.toISOString(),
    }
    return new StepResponse(view)
  },
)

export const retrieveOrderDeliveryWorkflow = createWorkflow(
  "retrieve-order-delivery",
  function (input: { order_id: string }) {
    return new WorkflowResponse(readOrderDeliveryStep(input))
  },
)
