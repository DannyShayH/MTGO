import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import DeliveryModuleService from "../../modules/delivery/service"
import { MedusaError } from "@medusajs/framework/utils"
import { POSTAL_CODE_MODULE } from "../../modules/postal-code"
import PostalCodeModuleService from "../../modules/postal-code/service"
import { listApprovedAreas } from "./agent-access"

const readDeliveryAgentApprovedAreasStep = createStep(
  "read-delivery-agent-approved-areas",
  async (input: { agent_id: string }, { container }) => {
    const agent = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .retrieveDeliveryAgent(input.agent_id)
    // The register's town names let Admin group the codes by town.
    const { postal_codes, areas } = await listApprovedAreas(container, agent.id)
    return new StepResponse({
      agent_id: agent.id,
      authorization_revision: agent.authorization_revision,
      postal_codes,
      areas,
    })
  },
)

const replaceDeliveryAgentApprovedAreasStep = createStep(
  "replace-delivery-agent-approved-areas",
  async (
    input: { agent_id: string; postal_codes: string[] },
    { container },
  ) => {
    const postalService =
      container.resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
    const registered = await postalService.listPostalCodes(
      { postal_code: input.postal_codes },
      { take: null, select: ["postal_code"] },
    )
    const known = new Set(registered.map(({ postal_code }) => postal_code))
    if (input.postal_codes.some((code) => !known.has(code)))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "postal_code_invalid",
        "postal_code_invalid",
      )
    const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const result = await service.replaceApprovedAreas(input)
    if (!result)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "delivery_agent_areas_changed",
      )
    const { previous_postal_codes, changed, ...areas } = result
    return new StepResponse(
      areas,
      changed
        ? {
            agent_id: input.agent_id,
            postal_codes: previous_postal_codes,
            expected_revision: result.authorization_revision,
          }
        : null,
    )
  },
  async (previous, { container }) => {
    if (!previous) return
    await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .replaceApprovedAreas(previous)
  },
)

export const readDeliveryAgentApprovedAreasWorkflow = createWorkflow(
  "read-delivery-agent-approved-areas",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(readDeliveryAgentApprovedAreasStep(input))
  },
)

export const replaceDeliveryAgentApprovedAreasWorkflow = createWorkflow(
  "replace-delivery-agent-approved-areas",
  function (input: { agent_id: string; postal_codes: string[] }) {
    return new WorkflowResponse(replaceDeliveryAgentApprovedAreasStep(input))
  },
)
