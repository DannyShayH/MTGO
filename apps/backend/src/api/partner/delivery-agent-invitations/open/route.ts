import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { openDeliveryAgentInvitationWorkflow } from "../../../../workflows/delivery/invitations"
import { PostPartnerAcceptStaffInvitationBody } from "../../validators"

export async function POST(
  req: MedusaRequest<PostPartnerAcceptStaffInvitationBody>,
  res: MedusaResponse,
) {
  const { result } = await openDeliveryAgentInvitationWorkflow(req.scope).run({
    input: { token: req.validatedBody.token },
  })
  res.json({ invitation: result })
}
