import { randomUUID } from "node:crypto"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import DeliveryModuleService from "../../modules/delivery/service"

const issueDeliveryAgentInvitationStep = createStep(
  "issue-delivery-agent-invitation",
  async (
    input: { name: string; email: string; invited_by: string },
    { container },
  ) => {
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const email = input.email.trim().toLowerCase()
    const existing = await service.listDeliveryAgents(
      { email, status: ["pending", "authorized"] },
      { take: 1 },
    )
    if (existing.length)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "email_has_login",
        "email_has_login",
      )
    const agent = await service.createDeliveryAgents({
      ...input,
      email,
      status: "pending",
    })
    let invitationId: string | undefined
    try {
      const token = `${randomUUID()}${randomUUID()}`
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const invitation = await service.createDeliveryAgentInvitations({
        agent_id: agent.id,
        token,
        expires_at,
      })
      invitationId = invitation.id
      let base = process.env.PARTNER_PUBLIC_URL || "http://localhost:8100"
      while (base.endsWith("/")) base = base.slice(0, -1)
      const invitation_url = `${base}/delivery-invite?token=${encodeURIComponent(token)}`
      await container.resolve(Modules.NOTIFICATION).createNotifications({
        to: email,
        channel: "email",
        template: "delivery-agent-invitation",
        trigger_type: "delivery-agent.invited",
        resource_id: agent.id,
        data: { invitation_url, expires_at: expires_at.toISOString() },
        idempotency_key: `delivery-agent-invitation:${invitation.id}`,
      })
      return new StepResponse(
        {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          status: agent.status,
          expires_at,
        },
        { agent_id: agent.id, invitation_id: invitation.id },
      )
    } catch (error) {
      if (invitationId)
        await service.deleteDeliveryAgentInvitations(invitationId)
      await service.deleteDeliveryAgents(agent.id)
      throw error
    }
  },
  async (created, { container }) => {
    if (!created) return
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    await service.deleteDeliveryAgentInvitations(created.invitation_id)
    await service.deleteDeliveryAgents(created.agent_id)
  },
)

export const inviteDeliveryAgentWorkflow = createWorkflow(
  "invite-delivery-agent",
  function (input: { name: string; email: string; invited_by: string }) {
    return new WorkflowResponse(issueDeliveryAgentInvitationStep(input))
  },
)

const invalidInvitation = () =>
  new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "invitation_invalid",
    "invitation_invalid",
  )

const openDeliveryAgentInvitationStep = createStep(
  "open-delivery-agent-invitation",
  async (input: { token: string }, { container }) => {
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [invitation] = await service.listDeliveryAgentInvitations(
      { token: input.token },
      { relations: ["agent"], take: 1 },
    )
    if (
      !invitation ||
      invitation.agent.status !== "pending" ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    )
      throw invalidInvitation()
    return new StepResponse({
      id: invitation.agent.id,
      name: invitation.agent.name,
      email: invitation.agent.email,
    })
  },
)

export const openDeliveryAgentInvitationWorkflow = createWorkflow(
  "open-delivery-agent-invitation",
  function (input: { token: string }) {
    return new WorkflowResponse(openDeliveryAgentInvitationStep(input))
  },
)

const acceptDeliveryAgentInvitationStep = createStep(
  "accept-delivery-agent-invitation",
  async (
    input: { token: string; auth_identity_id: string; actor_id?: string },
    { container },
  ) => {
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [initial] = await service.listDeliveryAgentInvitations(
      { token: input.token },
      { relations: ["agent"], take: 1 },
    )
    if (!initial) throw invalidInvitation()
    const locking = container.resolve(Modules.LOCKING)
    const result = await locking.execute(
      [`delivery-agent:${initial.agent.id}`],
      async () => {
        const [invitation] = await service.listDeliveryAgentInvitations(
          { token: input.token },
          { relations: ["agent"], take: 1 },
        )
        if (
          !invitation ||
          invitation.agent.status !== "pending" ||
          new Date(invitation.expires_at).getTime() <= Date.now()
        )
          throw invalidInvitation()
        const auth = container.resolve(Modules.AUTH)
        const identity = await auth.retrieveAuthIdentity(
          input.auth_identity_id,
          { relations: ["provider_identities"] },
        )
        const login = identity.provider_identities?.find(
          ({ provider }) => provider === "delivery-agent-emailpass",
        )
        const assigned = identity.app_metadata?.delivery_agent_id
        if (
          !login ||
          login.entity_id.toLowerCase() !== invitation.agent.email.toLowerCase()
        )
          throw invalidInvitation()
        if (assigned && assigned !== invitation.agent.id) {
          if (
            typeof assigned !== "string" ||
            (input.actor_id && input.actor_id !== assigned)
          )
            throw invalidInvitation()
          const [previous] = await service.listDeliveryAgents(
            { id: assigned, status: "revoked", email: invitation.agent.email },
            { take: 1 },
          )
          if (!previous) throw invalidInvitation()
        } else if (input.actor_id && input.actor_id !== invitation.agent.id)
          throw invalidInvitation()
        await auth.updateAuthIdentities({
          id: identity.id,
          app_metadata: {
            ...identity.app_metadata,
            delivery_agent_id: invitation.agent.id,
          },
        })
        try {
          await service.consumeInvitation({
            agent_id: invitation.agent.id,
            token: input.token,
          })
        } catch (error) {
          const [current] = await service.listDeliveryAgents(
            { id: invitation.agent.id, status: "authorized" },
            { take: 1 },
          )
          if (!current)
            await auth.updateAuthIdentities({
              id: identity.id,
              app_metadata: identity.app_metadata ?? {},
            })
          throw error
        }
        return { id: invitation.agent.id }
      },
    )
    return new StepResponse(result)
  },
)

export const acceptDeliveryAgentInvitationWorkflow = createWorkflow(
  "accept-delivery-agent-invitation",
  function (input: {
    token: string
    auth_identity_id: string
    actor_id?: string
  }) {
    return new WorkflowResponse(acceptDeliveryAgentInvitationStep(input))
  },
)
