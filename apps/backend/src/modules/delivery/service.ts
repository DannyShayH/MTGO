import { LockMode } from "@medusajs/framework/mikro-orm/core"
import type { EntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import type { Context } from "@medusajs/framework/types"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import DeliveryAgent, {
  DeliveryAgentArea,
  DeliveryAgentInvitation,
} from "./models/delivery-agent"
import IntendedDelivery, {
  type AssignmentSource,
} from "./models/intended-delivery"

/** What the shared assignment rule needs, read under both row locks. */
export type AssignmentFacts = {
  agent: {
    id: string
    status: "pending" | "authorized" | "revoked"
    postal_codes: string[]
    active_order_id: string | null
  }
  delivery: {
    order_id: string
    pickup_postal_code: string
    destination_postal_code: string
    claim_deadline: Date | string
    assigned_agent_id: string | null
  }
  order_active: boolean
  /** The authenticated actor of this request. */
  actor_id: string
  request_holder: {
    order_id: string
    agent_id: string
    actor_id: string
  } | null
}

export type AssignmentOutcome =
  | { outcome: "assign" }
  | { outcome: "already_assigned" }
  | { outcome: "refused"; code: string }

export type AssignmentCommand = {
  order_id: string
  agent_id: string
  /** The authenticated actor: the agent itself, or the operator. */
  actor_id: string
  source: AssignmentSource
  request_id: string
  /** Decided under the Order's guard by the caller. */
  order_active: boolean
  now: Date
}

class DeliveryModuleService extends MedusaService({
  DeliveryAgent,
  DeliveryAgentArea,
  DeliveryAgentInvitation,
  IntendedDelivery,
}) {
  /** Fence credential creation against consumption and revocation, even if a lease is lost. */
  @InjectManager()
  @InjectTransactionManager()
  async withPendingInvitation<T>(
    input: { agent_id: string; token: string },
    operation: () => Promise<T>,
    @MedusaContext() context: Context = {},
  ): Promise<T> {
    const manager = context.transactionManager as EntityManager
    const locked = await manager.findOne(
      "DeliveryAgent",
      { id: input.agent_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    const [agent] = await this.listDeliveryAgents(
      { id: input.agent_id, status: "pending" },
      { take: 1 },
      context,
    )
    const [invitation] = await this.listDeliveryAgentInvitations(
      { agent_id: input.agent_id, token: input.token },
      { take: 1 },
      context,
    )
    if (
      !locked ||
      !agent ||
      !invitation ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "invitation_invalid",
        "invitation_invalid",
      )
    return operation()
  }

  /** Revoke without deleting the agent's historical identity. */
  @InjectManager()
  @InjectTransactionManager()
  async revokeAgent(
    input: { agent_id: string; revoked_by: string },
    @MedusaContext() context: Context = {},
  ): Promise<void> {
    const manager = context.transactionManager as EntityManager
    const locked = await manager.findOne(
      "DeliveryAgent",
      { id: input.agent_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!locked)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "delivery_agent_not_found",
        "delivery_agent_not_found",
      )
    const agent = await this.retrieveDeliveryAgent(input.agent_id, {}, context)
    if (agent.status === "revoked") return
    const invitations = await this.listDeliveryAgentInvitations(
      { agent_id: agent.id },
      { take: null },
      context,
    )
    if (invitations.length)
      await this.deleteDeliveryAgentInvitations(
        invitations.map(({ id }) => id),
        context,
      )
    await this.updateDeliveryAgents(
      {
        id: agent.id,
        status: "revoked",
        revoked_at: new Date(),
        revoked_by: input.revoked_by,
        authorization_revision: agent.authorization_revision + 1,
      },
      context,
    )
  }

  /** The locked agent row serializes invitation consumption with access changes. */
  @InjectManager()
  @InjectTransactionManager()
  async consumeInvitation(
    input: { agent_id: string; token: string },
    @MedusaContext() context: Context = {},
  ): Promise<void> {
    const manager = context.transactionManager as EntityManager
    const locked = await manager.findOne(
      "DeliveryAgent",
      { id: input.agent_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    const [agent] = await this.listDeliveryAgents(
      { id: input.agent_id, status: "pending" },
      { take: 1 },
      context,
    )
    const [invitation] = await this.listDeliveryAgentInvitations(
      { agent_id: input.agent_id, token: input.token },
      { take: 1 },
      context,
    )
    if (
      !locked ||
      !agent ||
      !invitation ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "invitation_invalid",
        "invitation_invalid",
      )
    await this.updateDeliveryAgents(
      {
        id: agent.id,
        status: "authorized",
        accepted_at: new Date(),
        authorization_revision: agent.authorization_revision + 1,
      },
      context,
    )
    await this.deleteDeliveryAgentInvitations(invitation.id, context)
  }

  /** Serialize permission replacement with future claims on the agent row. */
  @InjectManager()
  @InjectTransactionManager()
  async replaceApprovedAreas(
    input: {
      agent_id: string
      postal_codes: string[]
      expected_revision?: number
    },
    @MedusaContext() context: Context = {},
  ) {
    const manager = context.transactionManager as EntityManager
    const agent = await manager.findOne(
      "DeliveryAgent",
      { id: input.agent_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!agent)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "delivery_agent_not_found",
        "delivery_agent_not_found",
      )
    const currentAgent = await this.retrieveDeliveryAgent(
      input.agent_id,
      {},
      context,
    )
    if (
      input.expected_revision !== undefined &&
      currentAgent.authorization_revision !== input.expected_revision
    )
      return null
    const current = await this.listDeliveryAgentAreas(
      { agent_id: input.agent_id },
      { take: null },
      context,
    )
    const desired = new Set(input.postal_codes)
    const existing = new Set(current.map(({ postal_code }) => postal_code))
    const removed = current.filter(
      ({ postal_code }) => !desired.has(postal_code),
    )
    const added = [...desired].filter(
      (postal_code) => !existing.has(postal_code),
    )
    const changed = removed.length > 0 || added.length > 0
    if (removed.length)
      await this.softDeleteDeliveryAgentAreas(
        removed.map(({ id }) => id),
        {},
        context,
      )
    if (added.length)
      await this.createDeliveryAgentAreas(
        added.map((postal_code) => ({ agent_id: input.agent_id, postal_code })),
        context,
      )
    if (changed)
      await this.updateDeliveryAgents(
        {
          id: input.agent_id,
          authorization_revision: currentAgent.authorization_revision + 1,
        },
        context,
      )
    return {
      agent_id: input.agent_id,
      authorization_revision:
        currentAgent.authorization_revision + (changed ? 1 : 0),
      postal_codes: [...desired].sort((a, b) => a.localeCompare(b)),
      previous_postal_codes: current.map(({ postal_code }) => postal_code),
      changed,
    }
  }

  /**
   * The one guarded assignment (#157). In one transaction it locks the agent
   * row (serializing with area changes and revocation), then the delivery
   * row, re-reads the agent's areas, active hold and the retry identity, lets
   * `decide` apply the shared rule and commits responsibility and the
   * active-capacity hold in one update whose selector requires the delivery
   * to be unassigned. The unique `active_agent_id` index backs the
   * one-active-delivery rule even if a lock is lost.
   */
  @InjectManager()
  @InjectTransactionManager()
  async assignDelivery(
    command: AssignmentCommand,
    decide: (facts: AssignmentFacts, now: Date) => AssignmentOutcome,
    @MedusaContext() context: Context = {},
  ) {
    const manager = context.transactionManager as EntityManager
    const lockedAgent = await manager.findOne(
      "DeliveryAgent",
      { id: command.agent_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!lockedAgent)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "delivery_agent_not_found",
        "delivery_agent_not_found",
      )
    const lockedDelivery = await manager.findOne(
      "IntendedDelivery",
      { order_id: command.order_id, deleted_at: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!lockedDelivery)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "delivery_not_found",
        "delivery_not_found",
      )
    const agent = await this.retrieveDeliveryAgent(
      command.agent_id,
      {},
      context,
    )
    const [record] = await this.listIntendedDeliveries(
      { order_id: command.order_id },
      { take: 1 },
      context,
    )
    const areas = await this.listDeliveryAgentAreas(
      { agent_id: agent.id },
      { take: null, select: ["postal_code"] },
      context,
    )
    const [active] = await this.listIntendedDeliveries(
      { active_agent_id: agent.id },
      { take: 1, select: ["order_id"] },
      context,
    )
    const [holder] = await this.listIntendedDeliveries(
      { assignment_request_id: command.request_id },
      { take: 1, select: ["order_id", "assigned_agent_id", "assigned_by"] },
      context,
    )
    const outcome = decide(
      {
        agent: {
          id: agent.id,
          status: agent.status,
          postal_codes: areas.map(({ postal_code }) => postal_code),
          active_order_id: active?.order_id ?? null,
        },
        delivery: record,
        order_active: command.order_active,
        actor_id: command.actor_id,
        // A retry identity is only ever stored with its assignment.
        request_holder: holder
          ? {
              order_id: holder.order_id,
              agent_id: holder.assigned_agent_id as string,
              actor_id: holder.assigned_by as string,
            }
          : null,
      },
      command.now,
    )
    if (outcome.outcome !== "assign") return { outcome, delivery: record }
    const [updated] = await this.updateIntendedDeliveries(
      {
        selector: { id: record.id, assigned_agent_id: null },
        data: {
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
          assigned_at: command.now,
          assigned_by: command.actor_id,
          assignment_source: command.source,
          assignment_request_id: command.request_id,
        },
      },
      context,
    )
    if (!updated)
      return {
        outcome: {
          outcome: "refused",
          code: "delivery_already_assigned",
        } as AssignmentOutcome,
        delivery: record,
      }
    return { outcome, delivery: updated }
  }
}

export default DeliveryModuleService
