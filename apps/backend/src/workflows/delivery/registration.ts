import type { AuthenticationResponse } from "@medusajs/framework/types"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import DeliveryModuleService from "../../modules/delivery/service"
import { openDeliveryAgentInvitationWorkflow } from "./invitations"

const invalid = () =>
  new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "invitation_invalid",
    "invitation_invalid",
  )
type RegistrationInput = {
  email: string
  token: string
}
const registerInvitedDeliveryAgentStep = createStep(
  "register-invited-delivery-agent",
  async ({ email, token }: RegistrationInput, { container }) => {
    const perform = container.resolve<
      (recovery: boolean) => Promise<AuthenticationResponse>
    >("deliveryAgentRegistrationOperation")
    const initial = await openDeliveryAgentInvitationWorkflow(container).run({
      input: { token },
    })
    if (email !== initial.result.email.toLowerCase()) throw invalid()
    const locking = container.resolve(Modules.LOCKING)
    const result = await locking.execute(
      [`delivery-agent:${initial.result.id}`],
      async () => {
        const { result } = await openDeliveryAgentInvitationWorkflow(
          container,
        ).run({ input: { token } })
        if (email !== result.email.toLowerCase()) throw invalid()
        const auth = container.resolve(Modules.AUTH)
        const [provider] = await auth.listProviderIdentities({
          provider: "delivery-agent-emailpass",
          entity_id: email,
        })
        if (provider?.auth_identity_id) {
          const identity = await auth.retrieveAuthIdentity(
            provider.auth_identity_id,
          )
          const assigned = identity.app_metadata?.delivery_agent_id
          if (assigned && assigned !== result.id) {
            if (typeof assigned !== "string") throw invalid()
            const service =
              container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
            const [previous] = await service.listDeliveryAgents(
              { id: assigned, status: "revoked", email: result.email },
              { take: 1 },
            )
            if (!previous) throw invalid()
          }
        }
        const service =
          container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
        return service.withPendingInvitation(
          { agent_id: result.id, token },
          () => perform(Boolean(provider)),
        )
      },
    )
    return new StepResponse(result)
  },
)
export const registerInvitedDeliveryAgentWorkflow = createWorkflow(
  "register-invited-delivery-agent",
  function (input: RegistrationInput) {
    return new WorkflowResponse(registerInvitedDeliveryAgentStep(input))
  },
)
