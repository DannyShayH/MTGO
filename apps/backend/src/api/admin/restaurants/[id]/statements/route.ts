import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listAdminStatementsWorkflow } from "../../../../../workflows/restaurant-finance/statement"
import type { GetPartnerStatementsQuery } from "../../../../../api/partner/validators"

/** Read-only operator statement; same contract as the authorized partner read. */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerStatementsQuery>,
  res: MedusaResponse,
) {
  const { result } = await listAdminStatementsWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      limit: req.validatedQuery.limit,
      offset: req.validatedQuery.offset,
    },
  })
  res.json(result)
}
