import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveAdminEarningsWorkflow } from "../../../../workflows/restaurant-finance/earnings"
import type { GetAdminEarningsMonthQuery } from "../validators"

/** One month's earnings with a page of its Restaurants (#256). */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetAdminEarningsMonthQuery>,
  res: MedusaResponse,
) {
  const { result } = await retrieveAdminEarningsWorkflow(req.scope).run({
    input: { month: req.params.month, ...req.validatedQuery },
  })
  res.json(result)
}
