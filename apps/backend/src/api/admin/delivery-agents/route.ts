import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { inviteDeliveryAgentWorkflow } from "../../../workflows/delivery/invitations"
import { listDeliveryAgentsWorkflow } from "../../../workflows/delivery/agents"
import { ListDeliveryAgentsQuery, InviteDeliveryAgentBody } from "./validators"

export async function POST(
  req: AuthenticatedMedusaRequest<InviteDeliveryAgentBody>,
  res: MedusaResponse,
) {
  const { result } = await inviteDeliveryAgentWorkflow(req.scope).run({
    input: { ...req.validatedBody, invited_by: req.auth_context.actor_id },
  })
  res.status(201).json({ agent: result })
}

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListDeliveryAgentsQuery>,
  res: MedusaResponse,
) {
  const { result } = await listDeliveryAgentsWorkflow(req.scope).run({
    input: req.validatedQuery,
  })
  res.json(result)
}
