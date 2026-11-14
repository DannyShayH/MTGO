import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { browseRestaurantsWorkflow } from "../../../workflows/restaurants"
import { GetStoreRestaurantsQuery } from "./validators"

export async function GET(
  req: MedusaRequest<unknown, GetStoreRestaurantsQuery>,
  res: MedusaResponse,
) {
  const { result } = await browseRestaurantsWorkflow(req.scope).run({
    input: {
      postal_code: req.validatedQuery.postal_code,
      town: req.validatedQuery.town,
    },
  })
  // Participation, opening and delivery-area changes show on the next fetch.
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
