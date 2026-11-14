import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readPartnerFoodCatalogueWorkflow } from "../../../workflows/food-catalogue"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readPartnerFoodCatalogueWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
