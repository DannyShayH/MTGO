import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import type {
  AssignmentSource,
  TerminalOutcome,
} from "../../modules/delivery/models/intended-delivery"
import { iso } from "../order-operations/outcomes"
import { deliveryAgentAccessRevoked } from "./agent-access"

/**
 * One entry of an agent's own completed work (#161; spec #48 stories 62,
 * 63): the Order reference, the Restaurant, the actual milestone times and
 * the terminal outcome. It never carries the Customer's name, phone,
 * destination or instructions, which stay on the Order for separately
 * authorized Customer and operator access. A milestone that was never
 * recorded, such as pickup on cancelled work, is null rather than invented.
 */
export type CompletedDelivery = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  accepted_at: string
  assigned_at: string | null
  assignment_source: AssignmentSource | null
  picked_up_at: string | null
  ended_at: string
  outcome: TerminalOutcome
}

type DeliveryRow = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  accepted_at: Date | string
  assigned_at: Date | string | null
  assignment_source: AssignmentSource | null
  picked_up_at: Date | string | null
  terminal_at: Date | string | null
  terminal_outcome: TerminalOutcome | null
}

const SELECT = [
  "id",
  "order_id",
  "order_reference",
  "restaurant_name",
  "pickup_address",
  "accepted_at",
  "assigned_at",
  "assignment_source",
  "picked_up_at",
  "terminal_at",
  "terminal_outcome",
]

export function completedDelivery(record: DeliveryRow): CompletedDelivery {
  return {
    id: record.id,
    order_id: record.order_id,
    order_reference: record.order_reference,
    restaurant_name: record.restaurant_name,
    pickup_address: record.pickup_address,
    accepted_at: iso(record.accepted_at) as string,
    assigned_at: iso(record.assigned_at),
    assignment_source: record.assignment_source,
    picked_up_at: iso(record.picked_up_at),
    ended_at: iso(record.terminal_at) as string,
    outcome: record.terminal_outcome as TerminalOutcome,
  }
}

async function authorizedAgent(container: MedusaContainer, agent_id: string) {
  const [agent] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listDeliveryAgents(
      { id: agent_id, status: "authorized" },
      { take: 1, select: ["id"] },
    )
  if (!agent) throw deliveryAgentAccessRevoked()
}

/**
 * One of the agent's own ended deliveries. Work that is still active,
 * belongs to another agent or does not exist is not found alike, so the
 * answer reveals nothing about anyone else's work.
 */
export async function readCompletedDelivery(
  container: MedusaContainer,
  input: { agent_id: string; order_id: string },
): Promise<CompletedDelivery> {
  await authorizedAgent(container, input.agent_id)
  const [record] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      {
        order_id: input.order_id,
        assigned_agent_id: input.agent_id,
        terminal_outcome: { $ne: null },
      },
      { take: 1, select: SELECT },
    )
  if (!record)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "delivery_not_found",
      "delivery_not_found",
    )
  return completedDelivery(record as unknown as DeliveryRow)
}

export const readCompletedDeliveryStep = createStep(
  "read-completed-delivery",
  async (input: { agent_id: string; order_id: string }, { container }) =>
    new StepResponse({
      delivery: await readCompletedDelivery(container, input),
      server_time: new Date().toISOString(),
    }),
)

export const retrieveCompletedDeliveryWorkflow = createWorkflow(
  "retrieve-completed-delivery",
  function (input: { agent_id: string; order_id: string }) {
    return new WorkflowResponse(readCompletedDeliveryStep(input))
  },
)

/**
 * The agent's own ended deliveries, newest outcome first, filtered by
 * responsibility in the module query before paging. Another agent's work
 * is never read.
 */
const listCompletedDeliveriesStep = createStep(
  "list-completed-deliveries",
  async (
    input: { agent_id: string; limit: number; offset: number },
    { container },
  ) => {
    await authorizedAgent(container, input.agent_id)
    const page = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        {
          assigned_agent_id: input.agent_id,
          terminal_outcome: { $ne: null },
        },
        {
          select: SELECT,
          order: { terminal_at: "DESC", id: "DESC" },
          skip: input.offset,
          take: input.limit + 1,
        },
      )
    return new StepResponse({
      deliveries: page
        .slice(0, input.limit)
        .map((record) => completedDelivery(record as unknown as DeliveryRow)),
      has_more: page.length > input.limit,
      limit: input.limit,
      offset: input.offset,
      server_time: new Date().toISOString(),
    })
  },
)

export const listCompletedDeliveriesWorkflow = createWorkflow(
  "list-completed-deliveries",
  function (input: { agent_id: string; limit: number; offset: number }) {
    return new WorkflowResponse(listCompletedDeliveriesStep(input))
  },
)
