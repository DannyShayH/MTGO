import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveAuthorizedStaffWorkflow } from "../../../workflows/restaurant-staff"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveAuthorizedStaffWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id },
  })
  res.json(result)
}
