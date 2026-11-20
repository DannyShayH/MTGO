import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createLogRecord } from "@dtc/logging"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { ROUTING_MODULE } from "../../modules/routing"
import type RoutingModuleService from "../../modules/routing/service"
import type { Coordinates } from "../../modules/routing/service"
import { requireAuthorizedDeliveryAgent } from "./agent-access"
import { scanAvailablePage } from "./available"

async function measureTrip(container: MedusaContainer, order_id: string) {
  const routing = container.resolve<RoutingModuleService>(ROUTING_MODULE)
  if (!routing.isConfigured()) return
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [record] = await delivery.listIntendedDeliveries(
    { order_id },
    { take: 1, select: ["id", "restaurant_id", "trip_measured_at"] },
  )
  // Measured once: a retried acceptance never calls the provider again.
  if (!record || record.trip_measured_at) return
  const [restaurant] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants({ id: record.restaurant_id }, { take: 1 })
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: [
        "shipping_address.address_1",
        "shipping_address.postal_code",
        "shipping_address.city",
      ],
      filters: { id: order_id },
    })
  const address = (
    data[0] as {
      shipping_address?: {
        address_1?: string | null
        postal_code?: string | null
        city?: string | null
      }
    }
  )?.shipping_address
  const [pickup, destination] = await Promise.all([
    restaurant
      ? routing.geocode({
          street: restaurant.address_street,
          postal_code: restaurant.address_postal_code,
          city: restaurant.address_city,
        })
      : null,
    address?.address_1 && address.postal_code && address.city
      ? routing.geocode({
          street: address.address_1,
          postal_code: address.postal_code,
          city: address.city,
        })
      : null,
  ])
  const trip_distance_m =
    pickup && destination
      ? await routing.tripDistance(pickup, destination)
      : null
  await delivery.recordTrip({
    order_id,
    pickup,
    destination,
    trip_distance_m,
    measured_at: new Date(),
  })
}

/**
 * Measures accepted work's trip once (#191), after the Order's lock is
 * released so the provider never holds acceptance up. It never fails: a
 * missing key, a provider failure or an unknown address leaves the distance
 * unavailable, and the accepted work stays claimable. It is the
 * workflow's last step and has no compensation: the measurement is a
 * write-once fact of the delivery, like its acceptance, and a failure here
 * must never undo the committed acceptance (ADR-0021).
 */
export const measureTripStep = createStep(
  "measure-trip",
  async (input: { order_id: string }, { container }) => {
    try {
      await measureTrip(container, input.order_id)
    } catch (error) {
      const record = createLogRecord("backend", "request.failed", {
        route: "/partner/orders/:id/accept",
        method: "POST",
        order_id: input.order_id,
        err: error,
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
    }
    return new StepResponse(undefined)
  },
)

export type PickupPoint = { order_id: string; pickup: Coordinates | null }

/**
 * The pickups an agent may measure their distance to (#191): their current
 * delivery and the deliveries in their available view, in the order asked.
 * Anything else is left out without saying why. It carries no agent
 * position: the route measures that outside the workflow, so the position
 * is never part of a workflow's stored input.
 */
const listPickupPointsStep = createStep(
  "list-pickup-points",
  async (
    input: { agent_id: string; order_ids: string[] },
    { container },
  ): Promise<StepResponse<PickupPoint[]>> => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const agent = await requireAuthorizedDeliveryAgent(
      container,
      input.agent_id,
    )
    const order_ids = [...new Set(input.order_ids)]
    const [currents, areas] = await Promise.all([
      delivery.listIntendedDeliveries(
        { active_agent_id: agent.id, order_id: order_ids },
        { take: 1 },
      ),
      delivery.listDeliveryAgentAreas({ agent_id: agent.id }, { take: null }),
    ])
    const approved = areas.map(({ postal_code }) => postal_code)
    const availableNow = approved.length
      ? await scanAvailablePage(
          container,
          delivery,
          { limit: order_ids.length, offset: 0, order_id: order_ids },
          approved,
          new Date(),
        )
      : []
    const inView = new Map(
      [...currents, ...availableNow.map(({ record }) => record)].map(
        (record) => [record.order_id, record],
      ),
    )
    return new StepResponse(
      order_ids.flatMap((order_id) => {
        const record = inView.get(order_id)
        if (!record) return []
        const { pickup_latitude: latitude, pickup_longitude: longitude } =
          record
        return [
          {
            order_id,
            pickup:
              latitude === null || longitude === null
                ? null
                : { latitude, longitude },
          },
        ]
      }),
    )
  },
)

export const listPickupPointsWorkflow = createWorkflow(
  "list-pickup-points",
  function (input: { agent_id: string; order_ids: string[] }) {
    return new WorkflowResponse(listPickupPointsStep(input))
  },
)
