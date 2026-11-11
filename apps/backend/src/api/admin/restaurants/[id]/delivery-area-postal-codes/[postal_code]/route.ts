import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { changeDeliveryAreaWorkflow } from "../../../../../../workflows/restaurants"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await changeDeliveryAreaWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      add: [],
      remove: [req.params.postal_code],
    },
  })
  res.json(result)
}
