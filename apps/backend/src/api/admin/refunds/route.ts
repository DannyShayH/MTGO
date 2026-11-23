import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listOpenRefundsWorkflow } from "../../../workflows/order-operations"
import type { ListRefundsQuery } from "./validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListRefundsQuery>,
  res: MedusaResponse,
) {
  const { result } = await listOpenRefundsWorkflow(req.scope).run({
    input: req.validatedQuery as ListRefundsQuery,
  })
  res.json(result)
}
