import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelStaffInvitationWorkflow } from "../../../../../../workflows/restaurant-staff"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await cancelStaffInvitationWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id, staff_id: req.params.staff_id },
  })
  res.json(result)
}
