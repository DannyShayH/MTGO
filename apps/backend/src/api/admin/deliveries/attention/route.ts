import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listDeliveryAttentionWorkflow } from "../../../../workflows/delivery/attention"
import type { ListDeliveryAttentionQuery } from "../validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListDeliveryAttentionQuery>,
  res: MedusaResponse,
) {
  const { result } = await listDeliveryAttentionWorkflow(req.scope).run({
    input: req.validatedQuery as ListDeliveryAttentionQuery,
  })
  res.json(result)
}
