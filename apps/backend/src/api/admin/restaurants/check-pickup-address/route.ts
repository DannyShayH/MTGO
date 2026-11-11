import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { checkPickupAddressWorkflow } from "../../../../workflows/restaurants"
import { PickupAddressBody } from "../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PickupAddressBody>,
  res: MedusaResponse,
) {
  const { exclude_id, ...address } = req.validatedBody
  const { result } = await checkPickupAddressWorkflow(req.scope).run({
    input: { address, exclude_id },
  })
  res.json(result)
}
