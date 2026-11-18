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

class DeliveryModuleService extends MedusaService({
  DeliveryAgent,
  DeliveryAgentArea,
  DeliveryAgentInvitation,
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
}

export default DeliveryModuleService
