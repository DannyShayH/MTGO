import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readAdminDishWorkflow } from "../../../../../workflows/admin-dishes"

/** GET /admin/products/{id}/dish: operator-only Restaurant dish inspection. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readAdminDishWorkflow(req.scope).run({
    input: { product_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
