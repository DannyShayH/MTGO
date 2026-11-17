import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readAdminRestaurantMenuWorkflow } from "../../../../../workflows/admin-dishes"

/** GET /admin/restaurants/{id}/menu: operator-only inspection, including inactive Restaurants. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readAdminRestaurantMenuWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
