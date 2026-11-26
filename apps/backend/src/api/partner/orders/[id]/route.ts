import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { isFeatureReleased } from "../../../feature-flag"
import { retrievePartnerOrderWorkflow } from "../../../../workflows/order-operations"
import RestaurantStatementsFeatureFlag from "../../../../feature-flags/restaurant-statements"

/**
 * One of the staff member's Restaurant's Orders; any other id is not found.
 * While the Restaurant statements flag is on (ADR-0022) the Order also
 * carries its read-only `financial_basis` (#226); off, the field is absent
 * and the operational Order is unchanged. The Order always carries its
 * `food_rating` (#249), `null` when undelivered or unrated.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const isFinancialBasisReleased = isFeatureReleased(
    req.scope,
    RestaurantStatementsFeatureFlag.key,
  )
  const { result } = await retrievePartnerOrderWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      order_id: req.params.id,
      include_financial_basis: isFinancialBasisReleased,
    },
  })
  res.json(result)
}
