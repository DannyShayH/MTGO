import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { changeDeliveryAreaWorkflow } from "../../../../../../workflows/restaurants"
import { PostAdminChangeDeliveryAreaBody } from "../../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminChangeDeliveryAreaBody>,
  res: MedusaResponse,
) {
  const { result } = await changeDeliveryAreaWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id, ...req.validatedBody },
  })
  res.json(result)
}
