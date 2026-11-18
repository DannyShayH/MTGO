import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { asValue } from "@medusajs/framework/awilix"
import type { AuthenticationResponse } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { registerInvitedDeliveryAgentWorkflow } from "../workflows/delivery/registration"

const invalid = () =>
  new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "invitation_invalid",
    "invitation_invalid",
  )

/** Attach an unforgeable guard that holds the agent lock during credential mutation. */
export async function guardDeliveryAgentProvider(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (req.params.auth_provider?.toLowerCase() !== "delivery-agent-emailpass")
    return next()
  if (req.params.actor_type?.toLowerCase() !== "delivery_agent") throw invalid()
  const segments = req.originalUrl
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).toLowerCase())
  if (req.method !== "POST" || segments[3] !== "register") return next()
  const body = req.body as
    | {
        email?: unknown
        invitation_token?: unknown
        agent_registration_guard?: unknown
      }
    | undefined
  if (
    typeof body?.email !== "string" ||
    typeof body.invitation_token !== "string" ||
    !body.invitation_token
  )
    throw invalid()
  const email = body.email.trim().toLowerCase()
  const token = body.invitation_token
  body.agent_registration_guard = async (
    perform: (recovery: boolean) => Promise<AuthenticationResponse>,
  ) => {
    const scope = req.scope.createScope()
    scope.register({ deliveryAgentRegistrationOperation: asValue(perform) })
    const { result } = await registerInvitedDeliveryAgentWorkflow(scope).run({
      input: { email, token },
    })
    return result
  }
  next()
}
