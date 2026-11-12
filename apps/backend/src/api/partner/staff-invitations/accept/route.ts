import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { acceptStaffInvitationWorkflow } from "../../../../workflows/restaurant-staff"
import { PostPartnerAcceptStaffInvitationBody } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerAcceptStaffInvitationBody>,
  res: MedusaResponse,
) {
  const { result } = await acceptStaffInvitationWorkflow(req.scope).run({
    input: {
      token: req.validatedBody.token,
      auth_identity_id: req.auth_context.auth_identity_id,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
