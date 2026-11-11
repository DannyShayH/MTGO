import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { changeDeliveryAreaWorkflow } from "../../../../../workflows/restaurants"
import { PostAdminAddDeliveryAreaPostalCodeBody } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminAddDeliveryAreaPostalCodeBody>,
  res: MedusaResponse,
) {
  const { result } = await changeDeliveryAreaWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      add: [req.validatedBody.postal_code],
      remove: [],
    },
  })
  res.json(result)
}
