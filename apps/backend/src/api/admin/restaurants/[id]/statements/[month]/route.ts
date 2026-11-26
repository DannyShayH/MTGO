import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveAdminStatementWorkflow } from "../../../../../../workflows/restaurant-finance/statement"
import type { GetPartnerStatementsQuery } from "../../../../../../api/partner/validators"

/** Read-only operator statement; same contract as the authorized partner read. */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerStatementsQuery>,
  res: MedusaResponse,
) {
  const { result } = await retrieveAdminStatementWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      month: req.params.month,
      limit: req.validatedQuery.limit,
      offset: req.validatedQuery.offset,
    },
  })
  res.json(result)
}
