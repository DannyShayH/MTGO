import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveAuthorizedStaffWorkflow } from "../../../workflows/restaurant-staff"
import { isFeatureReleased } from "../../feature-flag"
import RestaurantStatementsFeatureFlag from "../../../feature-flags/restaurant-statements"
import FeedbackFeatureFlag from "../../../feature-flags/feedback"

/**
 * The signed-in staff member and their Restaurant, with the backend-owned
 * Features the partner app shows navigation for (ADR-0022).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveAuthorizedStaffWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id },
  })
  res.json({
    ...result,
    features: {
      restaurant_statements: isFeatureReleased(
        req.scope,
        RestaurantStatementsFeatureFlag.key,
      ),
      // The Ratings page and per-Order food rating (#249).
      feedback: isFeatureReleased(req.scope, FeedbackFeatureFlag.key),
    },
  })
}
