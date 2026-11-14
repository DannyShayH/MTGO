import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readFoodCatalogueWorkflow } from "../../../workflows/food-catalogue"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await readFoodCatalogueWorkflow(req.scope).run({
    input: undefined,
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
