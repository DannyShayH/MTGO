import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  readDeliveryAgentApprovedAreasWorkflow,
  replaceDeliveryAgentApprovedAreasWorkflow,
} from "../../../../../workflows/delivery/areas"
import { ReplaceDeliveryAgentAreasBody } from "../../validators"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readDeliveryAgentApprovedAreasWorkflow(
    req.scope,
  ).run({
    input: { agent_id: req.params.id },
  })
  res.json(result)
}

export async function POST(
  req: AuthenticatedMedusaRequest<ReplaceDeliveryAgentAreasBody>,
  res: MedusaResponse,
) {
  const { result } = await replaceDeliveryAgentApprovedAreasWorkflow(
    req.scope,
  ).run({
    input: {
      agent_id: req.params.id,
      postal_codes: req.validatedBody.postal_codes,
    },
  })
  res.json(result)
}
