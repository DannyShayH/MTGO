import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import type { AssignmentSource } from "../../modules/delivery/models/intended-delivery"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { orderOperationLock } from "../order-operations/locks"
import { commitUnassignedCancellation } from "../order-operations/unassigned-cancellation"
import { settleCancellation } from "../order-operations/cancellation"
import {
  ASSIGNMENT_CONFLICTS,
  isActiveOrderState,
  decideAssignment,
  type AssignmentRefusal,
} from "./assignment-rules"
import {
  STALLED_ATTENTION_TYPES,
  stalledAttentionDueAt,
} from "./attention-rules"
import { scanAvailablePage } from "./available"
import {
  deliveryAgentAccessRevoked,
  requireAuthorizedDeliveryAgent,
} from "./agent-access"
import { deliveryAgentLockKey } from "./locks"
import { distanceKm } from "./distance"

type AssignInput = {
  order_id: string
  agent_id: string
  actor_id: string
  source: AssignmentSource
  request_id: string
  /** The server's time as ISO text; only workflow callers set it, never HTTP. */
  now?: string
}

function refusal(code: AssignmentRefusal, source: AssignmentSource) {
  // An agent whose access ended is signed out, as on every agent route.
  if (code === "delivery_agent_not_authorized" && source === "agent_claim")
    return deliveryAgentAccessRevoked()
  const type = (ASSIGNMENT_CONFLICTS as readonly string[]).includes(code)
    ? MedusaError.Types.CONFLICT
    : MedusaError.Types.NOT_ALLOWED
  return new MedusaError(type, code, code)
}

async function orderIsActive(container: MedusaContainer, order_id: string) {
  const [operation] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id },
      { select: ["state", "accepted_at"], take: 1 },
    )
  return !!operation?.accepted_at && isActiveOrderState(operation.state)
}

/**
 * The one guarded assignment capability (#157), for an agent's claim and an
 * operator's initial assignment alike. It holds the agent's capacity key and
 * the Order's authoritative guard (the same key acceptance, rejection and
 * future terminal transitions take), always in that order, through Medusa's
 * locking module, so separate server and worker processes serialize on
 * Redis. Under them it reads the Order's state and lets the delivery module
 * commit responsibility and capacity atomically. A request refused because
 * unassigned work reached its claim deadline commits the unassigned
 * cancellation under the same guard (#162), so the outcome never waits for
 * the sweep. A committed assignment is
 * authoritative and has no compensation: nothing here releases it.
 */
export const assignDeliveryStep = createStep(
  "assign-delivery",
  async (input: AssignInput, { container }) => {
    const keys = [
      deliveryAgentLockKey(input.agent_id),
      orderOperationLock(input.order_id).key,
    ]
    const result = await container.resolve(Modules.LOCKING).execute(
      keys,
      async () => {
        const order_active = await orderIsActive(container, input.order_id)
        // Decided at the guarded moment, not when the request arrived.
        const now = input.now ? new Date(input.now) : new Date()
        const assigned = await container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .assignDelivery(
            {
              ...input,
              order_active,
              now,
              pickup_attention_due_at: stalledAttentionDueAt,
            },
            decideAssignment,
          )
        // Too late for unassigned work: under the same guard the Order is
        // cancelled now, before any sweep has run (#162).
        const expiry =
          assigned.outcome.outcome === "refused" &&
          assigned.outcome.code === "claim_deadline_passed"
            ? await commitUnassignedCancellation(container, {
                order_id: input.order_id,
                now,
              })
            : null
        return { ...assigned, expiry }
      },
      { timeout: 10 },
    )
    if (result.expiry?.outcome === "cancelled")
      await settleCancellation(container, input.order_id)
    if (result.outcome.outcome === "refused")
      throw refusal(result.outcome.code as AssignmentRefusal, input.source)
    const record = result.delivery
    return new StepResponse({
      order_id: record.order_id,
      agent_id: record.assigned_agent_id as string,
      assigned_at: new Date(record.assigned_at as Date).toISOString(),
      assigned_by: record.assigned_by as string,
      source: record.assignment_source as AssignmentSource,
    })
  },
)

type CustomerAddress = {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  postal_code?: string | null
  city?: string | null
  phone?: string | null
}

export type DeliveryAction =
  | "confirm_pickup"
  | "record_arrival"
  | "record_contact_attempt"
  | "confirm_handover"

/** Raised attention the agent's phone shows (#163, #164). */
const AGENT_ATTENTION_TYPES = [
  ...STALLED_ATTENTION_TYPES,
  "arrived_without_handover",
] as const
export type AgentAttentionType = (typeof AGENT_ATTENTION_TYPES)[number]

export type CurrentDelivery = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  preparation_status: string
  accepted_at: string
  assigned_at: string
  assignment_source: AssignmentSource | null
  /** The recorded pickup milestone (#160), or null before collection. */
  picked_up_at: string | null
  /** The explicitly recorded arrival (#164), or null. */
  arrived_at: string | null
  /** The agent's recorded attempts to reach the Customer, oldest first (#164). */
  contact_attempts: { attempted_at: string }[]
  /** The route distance from pickup to the Customer (#191), or null. */
  trip_distance_km: number | null
  /**
   * Raised, outstanding attention on this delivery: collection or handover
   * still unconfirmed thirty minutes on (#163), or no handover ten minutes
   * after arrival (#164), shown first. The operator was told; these are
   * attention thresholds rather than promises, and change nothing the agent
   * may do.
   */
  attention: { type: AgentAttentionType; due_at: string } | null
  /**
   * What the agent may do now: confirm pickup once the food is ready; once
   * pickup is recorded, record arrival and then contact attempts (#164), and
   * confirm handover (#161), which never requires arrival.
   */
  allowed_actions: DeliveryAction[]
  customer: {
    name: string
    phone: string | null
    address_1: string
    address_2: string | null
    postal_code: string
    city: string
  }
}
/**
 * The next steps of active work: pickup once the food is ready; after it,
 * arrival then contact attempts, beside handover (#161, #164). An ended
 * Order allows nothing.
 */
function allowedActions(
  state: string,
  record: {
    picked_up_at: Date | string | null
    arrived_at: Date | string | null
  },
): DeliveryAction[] {
  if (!isActiveOrderState(state)) return []
  if (record.picked_up_at)
    return [
      record.arrived_at ? "record_contact_attempt" : "record_arrival",
      "confirm_handover",
    ]
  return state === "ready" ? ["confirm_pickup"] : []
}

type CurrentDeliveryView = {
  delivery: CurrentDelivery | null
  server_time: string
}

/**
 * The responsible agent's current delivery (#157; spec #48 stories 29-31):
 * the one delivery holding the agent's active capacity, whatever the agent's
 * areas are now. Only here are the historical destination and contact from
 * the Order's purchased shipping address revealed. Revoked access is refused.
 */
export const readCurrentDeliveryStep = createStep(
  "read-current-delivery",
  async (
    input: { agent_id: string },
    { container },
  ): Promise<StepResponse<CurrentDeliveryView>> => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const agent = await requireAuthorizedDeliveryAgent(
      container,
      input.agent_id,
    )
    const server_time = new Date().toISOString()
    const [record] = await delivery.listIntendedDeliveries(
      { active_agent_id: agent.id },
      { take: 1 },
    )
    if (!record) return new StepResponse({ delivery: null, server_time })
    const [operation] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id: record.order_id },
        { select: ["state"], take: 1 },
      )
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "order",
        fields: [
          "shipping_address.first_name",
          "shipping_address.last_name",
          "shipping_address.address_1",
          "shipping_address.address_2",
          "shipping_address.postal_code",
          "shipping_address.city",
          "shipping_address.phone",
        ],
        filters: { id: record.order_id },
      })
    const raised = await delivery.listDeliveryAttentions(
      {
        order_id: record.order_id,
        type: [...AGENT_ATTENTION_TYPES],
        raised_at: { $ne: null },
        resolved_at: null,
      },
      { take: null, select: ["type", "due_at"], order: { due_at: "DESC" } },
    )
    // An unreachable Customer is the most specific; otherwise the latest.
    const shown =
      raised.find(({ type }) => type === "arrived_without_handover") ??
      raised[0]
    const attempts = await delivery.listDeliveryContactAttempts(
      { order_id: record.order_id },
      {
        take: null,
        select: ["attempted_at"],
        order: { attempted_at: "ASC", id: "ASC" },
      },
    )
    // Placement requires a reviewed shipping address, so the Order has one.
    const address = (data[0] as { shipping_address: CustomerAddress })
      .shipping_address
    // An unset optional field reads as absent, never as text.
    const optional = (value?: string | null) => value || null
    return new StepResponse({
      delivery: {
        id: record.id,
        order_id: record.order_id,
        order_reference: record.order_reference,
        restaurant_name: record.restaurant_name,
        pickup_address: record.pickup_address,
        preparation_status: operation.state,
        accepted_at: new Date(record.accepted_at).toISOString(),
        assigned_at: new Date(record.assigned_at as Date).toISOString(),
        assignment_source: record.assignment_source,
        picked_up_at: record.picked_up_at
          ? new Date(record.picked_up_at).toISOString()
          : null,
        arrived_at: record.arrived_at
          ? new Date(record.arrived_at).toISOString()
          : null,
        contact_attempts: attempts.map(({ attempted_at }) => ({
          attempted_at: new Date(attempted_at).toISOString(),
        })),
        trip_distance_km: distanceKm(record.trip_distance_m),
        attention: shown
          ? {
              type: shown.type as AgentAttentionType,
              due_at: new Date(shown.due_at).toISOString(),
            }
          : null,
        allowed_actions: allowedActions(operation.state, record),
        customer: {
          name: [address.first_name, address.last_name]
            .filter(Boolean)
            .join(" "),
          phone: optional(address.phone),
          address_1: address.address_1 as string,
          address_2: optional(address.address_2),
          postal_code: address.postal_code as string,
          city: address.city as string,
        },
      },
      server_time,
    })
  },
)

/** An agent claims available work; the actor is the authenticated agent. */
export const claimDeliveryWorkflow = createWorkflow(
  "claim-delivery",
  function (input: {
    order_id: string
    agent_id: string
    request_id: string
    now?: string
  }) {
    const command = transform({ input }, ({ input }) => ({
      ...input,
      actor_id: input.agent_id,
      source: "agent_claim" as const,
    }))
    assignDeliveryStep(command)
    return new WorkflowResponse(
      readCurrentDeliveryStep(
        transform({ input }, ({ input }) => ({ agent_id: input.agent_id })),
      ),
    )
  },
)

const describeAssignmentStep = createStep(
  "describe-assignment",
  async (
    input: {
      order_id: string
      agent_id: string
      assigned_at: string
      assigned_by: string
      source: AssignmentSource
    },
    { container },
  ) => {
    const agent = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .retrieveDeliveryAgent(input.agent_id, { select: ["id", "name"] })
    return new StepResponse({
      order_id: input.order_id,
      assigned_at: input.assigned_at,
      assigned_by: input.assigned_by,
      source: input.source,
      agent: { id: agent.id, name: agent.name },
    })
  },
)

/**
 * An operator's initial assignment through Admin (#157; spec #48 stories 27,
 * 28): the same guarded capability and rule as a claim, for the selected
 * agent, recording the authenticated operator separately. It never replaces
 * an existing responsibility.
 */
export const assignDeliveryWorkflow = createWorkflow(
  "assign-delivery",
  function (input: {
    order_id: string
    agent_id: string
    operator_id: string
    request_id: string
  }) {
    const command = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
      agent_id: input.agent_id,
      request_id: input.request_id,
      actor_id: input.operator_id,
      source: "operator_assignment" as const,
    }))
    const assignment = assignDeliveryStep(command)
    return new WorkflowResponse(describeAssignmentStep(assignment))
  },
)

export const retrieveCurrentDeliveryWorkflow = createWorkflow(
  "retrieve-current-delivery",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(readCurrentDeliveryStep(input))
  },
)

/**
 * Unclaimed work for the operator's initial assignment (#157): the same
 * eligibility as the agents' available list, without an area filter and
 * without Customer details. Each delivery names the agents the claim rule
 * would accept now: authorized, approved for both postal codes and without
 * an active delivery. The assignment itself still decides under the guard.
 */
const listUnclaimedDeliveriesStep = createStep(
  "list-unclaimed-deliveries",
  async (input: { limit: number; offset: number }, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const now = new Date()
    const page = await scanAvailablePage(
      container,
      delivery,
      input,
      undefined,
      now,
    )
    const shown = page.slice(0, input.limit)
    const codes = [
      ...new Set(
        shown.flatMap(({ record }) => [
          record.pickup_postal_code,
          record.destination_postal_code,
        ]),
      ),
    ]
    const areas = codes.length
      ? await delivery.listDeliveryAgentAreas(
          { postal_code: codes },
          { take: null, select: ["agent_id", "postal_code"] },
        )
      : []
    const approved = new Map<string, Set<string>>()
    for (const { agent_id, postal_code } of areas as {
      agent_id: string
      postal_code: string
    }[])
      approved.set(
        agent_id,
        (approved.get(agent_id) ?? new Set()).add(postal_code),
      )
    const candidates = [...approved.keys()]
    const agents = candidates.length
      ? await delivery.listDeliveryAgents(
          { id: candidates, status: "authorized" },
          { take: null, select: ["id", "name"], order: { name: "ASC" } },
        )
      : []
    const busy = new Set(
      agents.length
        ? (
            await delivery.listIntendedDeliveries(
              { active_agent_id: agents.map(({ id }) => id) },
              { take: null, select: ["active_agent_id"] },
            )
          ).map(({ active_agent_id }) => active_agent_id)
        : [],
    )
    const free = agents.filter(({ id }) => !busy.has(id))
    return new StepResponse({
      deliveries: shown.map(({ record, state }) => ({
        id: record.id,
        order_id: record.order_id,
        order_reference: record.order_reference,
        restaurant_name: record.restaurant_name,
        pickup_postal_code: record.pickup_postal_code,
        destination_postal_code: record.destination_postal_code,
        preparation_status: state,
        accepted_at: new Date(record.accepted_at).toISOString(),
        claim_deadline: new Date(record.claim_deadline).toISOString(),
        eligible_agents: free
          .filter(({ id }) => {
            const codes = approved.get(id)!
            return (
              codes.has(record.pickup_postal_code) &&
              codes.has(record.destination_postal_code)
            )
          })
          .map(({ id, name }) => ({ id, name })),
      })),
      has_more: page.length > input.limit,
      limit: input.limit,
      offset: input.offset,
      server_time: now.toISOString(),
    })
  },
)

export const listUnclaimedDeliveriesWorkflow = createWorkflow(
  "list-unclaimed-deliveries",
  function (input: { limit: number; offset: number }) {
    return new WorkflowResponse(listUnclaimedDeliveriesStep(input))
  },
)
