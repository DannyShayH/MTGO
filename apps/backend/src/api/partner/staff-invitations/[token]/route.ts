import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { retrieveStaffInvitationWorkflow } from "../../../../workflows/restaurant-staff"

/** Public: the link itself is the credential, as in Medusa's admin invite. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await retrieveStaffInvitationWorkflow(req.scope).run({
    input: { token: req.params.token },
  })
  res.json(result)
}
