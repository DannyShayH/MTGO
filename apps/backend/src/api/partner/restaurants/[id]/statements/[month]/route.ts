import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrievePartnerStatementWorkflow } from "../../../../../../workflows/restaurant-finance/statement"
import type { GetPartnerStatementsQuery } from "../../../../validators"

/**
 * One Copenhagen month (`YYYY-MM`) of the staff member's own Restaurant
 * (#227): header, whole-month totals and one page of entries, newest
 * posting first. Read-only; withheld (404) while statements are not released.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerStatementsQuery>,
  res: MedusaResponse,
) {
  const { result } = await retrievePartnerStatementWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      restaurant_id: req.params.id,
      month: req.params.month,
      limit: req.validatedQuery.limit,
      offset: req.validatedQuery.offset,
    },
  })
  res.json(result)
}
