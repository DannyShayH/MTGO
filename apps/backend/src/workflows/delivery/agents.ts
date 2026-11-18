import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import DeliveryModuleService from "../../modules/delivery/service"

const listDeliveryAgentsStep = createStep(
  "list-delivery-agents",
  async (input: { limit: number; offset: number }, { container }) => {
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [agents, count] = await service.listAndCountDeliveryAgents(
      {},
      {
        take: input.limit,
        skip: input.offset,
        order: { created_at: "DESC", id: "DESC" },
      },
    )
    return new StepResponse({
      count,
      limit: input.limit,
      offset: input.offset,
      agents: agents.map(
        ({ id, name, email, status, created_at, accepted_at, revoked_at }) => ({
          id,
          name,
          email,
          status,
          created_at,
          accepted_at,
          revoked_at,
        }),
      ),
    })
  },
)
export const listDeliveryAgentsWorkflow = createWorkflow(
  "list-delivery-agents",
  function (input: { limit: number; offset: number }) {
    return new WorkflowResponse(listDeliveryAgentsStep(input))
  },
)

const revokeDeliveryAgentStep = createStep(
  "revoke-delivery-agent",
  async (input: { agent_id: string; revoked_by: string }, { container }) => {
    const locking = container.resolve(Modules.LOCKING)
    await locking.execute([`delivery-agent:${input.agent_id}`], async () => {
      await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .revokeAgent(input)
    })
    return new StepResponse({ id: input.agent_id })
  },
)
export const revokeDeliveryAgentWorkflow = createWorkflow(
  "revoke-delivery-agent",
  function (input: { agent_id: string; revoked_by: string }) {
    return new WorkflowResponse(revokeDeliveryAgentStep(input))
  },
)
