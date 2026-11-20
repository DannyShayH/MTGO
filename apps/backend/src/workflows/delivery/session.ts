import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  listApprovedAreas,
  requireAuthorizedDeliveryAgent,
} from "./agent-access"

export const DELIVERY_AGENT_ACTOR = "delivery_agent"

const retrieveAuthorizedDeliveryAgentStep = createStep(
  "retrieve-authorized-delivery-agent",
  async (input: { agent_id: string }, { container }) => {
    const agent = await requireAuthorizedDeliveryAgent(
      container,
      input.agent_id,
    )
    // The register's town names let the phone filter by town (#157).
    const { postal_codes, areas } = await listApprovedAreas(container, agent.id)
    return new StepResponse({
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        authorization_revision: agent.authorization_revision,
      },
      postal_codes,
      areas,
    })
  },
)

export const retrieveDeliveryAgentSessionWorkflow = createWorkflow(
  "retrieve-delivery-agent-session",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(retrieveAuthorizedDeliveryAgentStep(input))
  },
)
