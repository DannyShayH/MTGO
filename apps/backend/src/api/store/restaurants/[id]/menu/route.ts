import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readRestaurantMenuWorkflow } from "../../../../../workflows/menu"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await readRestaurantMenuWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id },
  })
  // A saved change must show on the next fetch, and ordering checks current data.
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
