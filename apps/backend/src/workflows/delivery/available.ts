import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CLAIM_WINDOW_MS, isActiveOrderState } from "./assignment-rules"

type DeliveryRecord = Awaited<
  ReturnType<DeliveryModuleService["listIntendedDeliveries"]>
>[number]
type ScanInput = { limit: number; offset: number; order_id?: string }

/**
 * Unassigned work before its deadline on active accepted Orders, oldest
 * acceptance first, in bounded batches. `selected` limits both postal codes
 * (an agent's areas); an operator's read passes none.
 */
export async function scanAvailablePage(
  container: MedusaContainer,
  delivery: DeliveryModuleService,
  input: ScanInput,
  selected: string[] | undefined,
  now: Date,
) {
  const page: { record: DeliveryRecord; state: string }[] = []
  let cursor = 0
  let eligible = 0
  while (page.length <= input.limit) {
    const records = await delivery.listIntendedDeliveries(
      {
        ...(input.order_id ? { order_id: input.order_id } : {}),
        assigned_agent_id: null,
        ...(selected
          ? { pickup_postal_code: selected, destination_postal_code: selected }
          : {}),
        claim_deadline: { $gt: now },
      },
      { order: { accepted_at: "ASC", id: "ASC" }, take: 50, skip: cursor },
    )
    if (!records.length) break
    cursor += records.length
    const operations = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id: records.map(({ order_id }) => order_id) },
        { select: ["order_id", "state", "accepted_at"], take: 50 },
      )
    const states = new Map(
      operations.map(({ order_id, state, accepted_at }) => [
        order_id,
        accepted_at && isActiveOrderState(state) ? state : null,
      ]),
    )
    for (const record of records) {
      const state = states.get(record.order_id)
      if (!state) continue
      if (eligible++ < input.offset) continue
      page.push({ record, state })
    }
  }
  return page
}

/** Recovery is safe to repeat: order_id is unique and acceptance is never rewritten. */
export const establishIntendedDeliveryStep = createStep(
  "establish-intended-delivery",
  async (input: { order_id: string }, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [existing] = await delivery.listIntendedDeliveries(
      { order_id: input.order_id },
      { take: 1 },
    )
    if (existing)
      return new StepResponse<DeliveryRecord | null, string | null>(
        existing,
        null,
      )
    const operation = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const [accepted] = await operation.listOrderOperations(
      { order_id: input.order_id },
      { take: 1 },
    )
    if (!accepted?.accepted_at)
      return new StepResponse<DeliveryRecord | null, string | null>(null, null)
    const [restaurant] = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurants({ id: accepted.restaurant_id }, { take: 1 })
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "order",
        fields: ["id", "display_id", "shipping_address.postal_code"],
        filters: { id: input.order_id },
      })
    const order = data[0] as unknown as
      | { display_id: number; shipping_address?: { postal_code?: string } }
      | undefined
    if (!restaurant || !order?.shipping_address?.postal_code)
      return new StepResponse<DeliveryRecord | null, string | null>(null, null)
    const acceptedAt = new Date(accepted.accepted_at)
    try {
      const record = await delivery.createIntendedDeliveries({
        order_id: input.order_id,
        restaurant_id: accepted.restaurant_id,
        restaurant_name: restaurant.name,
        pickup_address: `${restaurant.address_street}, ${restaurant.address_postal_code} ${restaurant.address_city}`,
        pickup_postal_code: restaurant.address_postal_code,
        destination_postal_code: order.shipping_address.postal_code,
        order_reference: order.display_id,
        accepted_at: acceptedAt,
        claim_deadline: new Date(acceptedAt.getTime() + CLAIM_WINDOW_MS),
      })
      return new StepResponse<DeliveryRecord | null, string | null>(
        record,
        record.id,
      )
    } catch (error) {
      const [concurrent] = await delivery.listIntendedDeliveries(
        { order_id: input.order_id },
        { take: 1 },
      )
      if (concurrent)
        return new StepResponse<DeliveryRecord | null, string | null>(
          concurrent,
          null,
        )
      throw error
    }
  },
  async (createdId: string | null, { container }) => {
    if (createdId)
      await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .deleteIntendedDeliveries(createdId)
  },
)

const listAvailableStep = createStep(
  "list-available",
  async (
    input: {
      agent_id: string
      postal_codes?: string[]
      limit: number
      offset: number
      order_id?: string
    },
    { container },
  ) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [agent] = await delivery.listDeliveryAgents(
      { id: input.agent_id, status: "authorized" },
      { take: 1 },
    )
    if (!agent)
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "delivery_agent_access_revoked",
      )
    const areas = await delivery.listDeliveryAgentAreas(
      { agent_id: agent.id },
      { take: null },
    )
    const approved = areas.map(({ postal_code }) => postal_code)
    const selected = input.postal_codes
      ? input.postal_codes.filter((code) => approved.includes(code))
      : approved
    const now = new Date()
    if (!selected.length)
      return new StepResponse({
        deliveries: [],
        has_more: false,
        limit: input.limit,
        offset: input.offset,
        server_time: now.toISOString(),
      })
    const page = await scanAvailablePage(
      container,
      delivery,
      input,
      selected,
      now,
    )
    return new StepResponse({
      deliveries: page.slice(0, input.limit).map(({ record, state }) => ({
        id: record.id,
        order_id: record.order_id,
        order_reference: record.order_reference,
        restaurant_name: record.restaurant_name,
        pickup_address: record.pickup_address,
        destination_postal_code: record.destination_postal_code,
        preparation_status: state,
        accepted_at: new Date(record.accepted_at).toISOString(),
        claim_deadline: new Date(record.claim_deadline).toISOString(),
      })),
      has_more: page.length > input.limit,
      limit: input.limit,
      offset: input.offset,
      server_time: now.toISOString(),
    })
  },
)

export const establishIntendedDeliveryWorkflow = createWorkflow(
  "establish-intended-delivery",
  function (input: { order_id: string }) {
    return new WorkflowResponse(establishIntendedDeliveryStep(input))
  },
)
export const listAvailableDeliveriesWorkflow = createWorkflow(
  "list-available-deliveries",
  function (input: {
    agent_id: string
    postal_codes?: string[]
    limit: number
    offset: number
    order_id?: string
  }) {
    return new WorkflowResponse(listAvailableStep(input))
  },
)
