import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"

export type AccountResetEvent = {
  actor_type: string
  entity_id: string
  token: string
  metadata?: Record<string, unknown>
}

const sendAccountPasswordResetEmailStep = createStep(
  "send-account-password-reset-email",
  async (input: AccountResetEvent, { container }) => {
    const actor = input.actor_type
    if (
      actor !== "delivery_agent" &&
      actor !== "restaurant_staff" &&
      actor !== "user"
    )
      return new StepResponse(false)
    const auth = container.resolve(Modules.AUTH)
    const [provider] = await auth.listProviderIdentities({
      provider:
        actor === "delivery_agent" ? "delivery-agent-emailpass" : "emailpass",
      entity_id: input.entity_id,
    })
    if (!provider?.auth_identity_id) return new StepResponse(false)
    const identity = await auth.retrieveAuthIdentity(provider.auth_identity_id)
    const actorId = identity.app_metadata?.[`${actor}_id`]
    if (typeof actorId !== "string") return new StepResponse(false)

    // Recovery changes credentials; it must never accept invitations or restore access.
    let hasAccess: boolean
    if (actor === "delivery_agent") {
      const agents = await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .listDeliveryAgents({
          id: actorId,
          email: input.entity_id,
          status: "authorized",
        })
      hasAccess = agents.length > 0
    } else if (actor === "restaurant_staff") {
      const staff = await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .listRestaurantStaffs({
          id: actorId,
          email: input.entity_id,
          status: "authorized",
        })
      hasAccess = staff.length > 0
    } else {
      const users = await container
        .resolve(Modules.USER)
        .listUsers({ id: actorId, email: input.entity_id })
      hasAccess = users.length > 0
    }
    if (!hasAccess) return new StepResponse(false)

    const language =
      actor === "user" || input.metadata?.language === "en" ? "en" : "da"
    const params = new URLSearchParams({ token: input.token })
    const base = (
      process.env.PARTNER_PUBLIC_URL || "http://localhost:8100"
    ).replace(/\/$/, "")
    const paths = {
      user: "/operator-reset-password",
      delivery_agent: "/delivery-reset-password",
      restaurant_staff: "/reset-password",
    }
    const path = paths[actor]
    const resetUrl = `${base}${path}#${params}`
    // Delivery cannot be undone; this is the workflow's final and only mutation.
    // Medusa's sendNotificationsStep likewise has no compensation. Keep the
    // notification record as evidence rather than pretending to unsend mail.
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: input.entity_id,
      channel: "email",
      template: "account-password-reset",
      resource_id: identity.id,
      data: { reset_url: resetUrl, language },
    })
    return new StepResponse(true)
  },
)

export const sendAccountPasswordResetEmailWorkflow = createWorkflow(
  "send-account-password-reset-email",
  function (input: AccountResetEvent) {
    return new WorkflowResponse(sendAccountPasswordResetEmailStep(input))
  },
)
