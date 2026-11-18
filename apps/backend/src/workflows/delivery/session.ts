import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import DeliveryModuleService from "../../modules/delivery/service"

export const DELIVERY_AGENT_ACTOR = "delivery_agent"

const retrieveAuthorizedDeliveryAgentStep = createStep(
  "retrieve-authorized-delivery-agent",
  async (input: { agent_id: string }, { container }) => {
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [agent] = await service.listDeliveryAgents(
      { id: input.agent_id, status: "authorized" },
      { take: 1 },
    )
    if (!agent)
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "delivery_agent_access_revoked",
        "delivery_agent_access_revoked",
      )
    const areas = await service.listDeliveryAgentAreas(
      { agent_id: agent.id },
      { take: null },
    )
    return new StepResponse({
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        authorization_revision: agent.authorization_revision,
      },
      postal_codes: areas
        .map(({ postal_code }) => postal_code)
        .sort((a, b) => a.localeCompare(b)),
    })
  },
)

export const retrieveDeliveryAgentSessionWorkflow = createWorkflow(
  "retrieve-delivery-agent-session",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(retrieveAuthorizedDeliveryAgentStep(input))
  },
)
