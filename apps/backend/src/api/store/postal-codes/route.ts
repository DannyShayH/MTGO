import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { searchPostalCodesWorkflow } from "../../../workflows/postal-codes"
import { GetStorePostalCodesQuery } from "./validators"

/** The same register search operators use, read-only and without Admin credentials. */
export async function GET(
  req: MedusaRequest<unknown, GetStorePostalCodesQuery>,
  res: MedusaResponse,
) {
  const { result } = await searchPostalCodesWorkflow(req.scope).run({
    input: { q: req.validatedQuery.q },
  })
  res.json(result)
}
