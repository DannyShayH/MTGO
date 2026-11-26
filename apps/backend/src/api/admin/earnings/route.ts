import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listAdminEarningsWorkflow } from "../../../workflows/restaurant-finance/earnings"
import type { GetAdminEarningsQuery } from "./validators"

/** MTOGO's monthly earnings across all Restaurants, newest first (#256). */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetAdminEarningsQuery>,
  res: MedusaResponse,
) {
  const { result } = await listAdminEarningsWorkflow(req.scope).run({
    input: {
      limit: req.validatedQuery.limit,
      offset: req.validatedQuery.offset,
    },
  })
  res.json(result)
}
