import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listPartnerStatementsWorkflow } from "../../../../../workflows/restaurant-finance/statement"
import type { GetPartnerStatementsQuery } from "../../../validators"

/**
 * The staff member's own Restaurant's monthly statements, newest first
 * (#227): read-only month summaries with whole-month totals and their
 * availability. Withheld (404) while Restaurant statements are not released.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerStatementsQuery>,
  res: MedusaResponse,
) {
  const { result } = await listPartnerStatementsWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      restaurant_id: req.params.id,
      limit: req.validatedQuery.limit,
      offset: req.validatedQuery.offset,
    },
  })
  res.json(result)
}
