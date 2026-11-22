import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { requireAuthorizedDeliveryAgent } from "./agent-access"
import { AGENT_ATTENTION_TYPES } from "./assignment"
import { scanAvailablePage } from "./available"
import {
  advanceDeliveryFeed,
  fingerprintOf,
  type DeliveryFeedState,
} from "./delivery-feed"

/** The available projection is fingerprinted over this many deliveries (two screen pages). */
export const DELIVERY_FEED_AVAILABLE_LIMIT = 50

/**
 * One bounded read of the durable facts behind an agent's two projections,
 * compared with what this connection already announced. Authorization is
 * checked first on every read, so revocation ends the feed before another
 * hint. The agent's approved areas decide which work is fingerprinted, so an
 * area change narrows or widens what is announced at once. Any process may
 * have written the records; the feed needs no messaging between them.
 */
const readDeliveryFeedStep = createStep(
  "read-delivery-feed-state",
  async (
    input: { agent_id: string; announced: DeliveryFeedState | null },
    { container },
  ) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const agent = await requireAuthorizedDeliveryAgent(
      container,
      input.agent_id,
    )
    const now = new Date()
    const areas = await delivery.listDeliveryAgentAreas(
      { agent_id: agent.id },
      { take: null, select: ["postal_code"] },
    )
    const selected = areas.map(({ postal_code }) => postal_code)
    const page = selected.length
      ? await scanAvailablePage(
          container,
          delivery,
          { limit: DELIVERY_FEED_AVAILABLE_LIMIT, offset: 0 },
          selected,
          now,
        )
      : []
    const available = fingerprintOf([
      ...selected.slice().sort((a, b) => a.localeCompare(b)),
      ...page.map(({ record, state }) => `${record.id}:${state}`),
    ])

    const [active] = await delivery.listIntendedDeliveries(
      { active_agent_id: agent.id },
      { take: 1 },
    )
    let current = fingerprintOf([])
    if (active) {
      const [operation] = await container
        .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
        .listOrderOperations(
          { order_id: active.order_id },
          { select: ["state", "revision"], take: 1 },
        )
      const attempts = await delivery.listDeliveryContactAttempts(
        { order_id: active.order_id },
        { take: null, select: ["id"] },
      )
      const raised = await delivery.listDeliveryAttentions(
        {
          order_id: active.order_id,
          type: [...AGENT_ATTENTION_TYPES],
          raised_at: { $ne: null },
          resolved_at: null,
        },
        { take: null, select: ["type", "due_at"] },
      )
      current = fingerprintOf([
        active.id,
        String(operation?.state),
        String(operation?.revision),
        String(active.picked_up_at ?? ""),
        String(active.arrived_at ?? ""),
        String(attempts.length),
        ...raised.map(({ type, due_at }) => `${type}@${String(due_at)}`),
      ])
    }

    const read: DeliveryFeedState = { available, current }
    // The first read is the baseline: nothing is announced for it.
    const { announced, scopes } = input.announced
      ? advanceDeliveryFeed(input.announced, read)
      : { announced: read, scopes: [] }
    return new StepResponse({
      scopes,
      announced,
      server_time: now.toISOString(),
    })
  },
)

/**
 * An agent's feed read (#165): authorization, then which of the available and
 * current projections changed since the connection last looked.
 */
export const readDeliveryFeedWorkflow = createWorkflow(
  "read-delivery-feed-state",
  function (input: { agent_id: string; announced: DeliveryFeedState | null }) {
    return new WorkflowResponse(readDeliveryFeedStep(input))
  },
)
