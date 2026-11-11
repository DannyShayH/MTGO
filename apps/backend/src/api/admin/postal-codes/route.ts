import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { searchPostalCodesWorkflow } from "../../../workflows/postal-codes"
import { GetAdminPostalCodesQuery } from "../restaurants/validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetAdminPostalCodesQuery>,
  res: MedusaResponse,
) {
  const { result } = await searchPostalCodesWorkflow(req.scope).run({
    input: { q: req.validatedQuery.q },
  })
  res.json(result)
}
