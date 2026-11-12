import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resendStaffInvitationWorkflow } from "../../../../../../../workflows/restaurant-staff"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await resendStaffInvitationWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id, staff_id: req.params.staff_id },
  })
  res.json(result)
}
