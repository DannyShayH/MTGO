import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  readMenuArrangementWorkflow,
  changeMenuArrangementWorkflow,
} from "../../../../../workflows/menu-arrangement"
import { MenuArrangementInput } from "../../../../../workflows/menu-arrangement/validation"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readMenuArrangementWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
export async function POST(
  req: AuthenticatedMedusaRequest<MenuArrangementInput>,
  res: MedusaResponse,
) {
  const { result } = await changeMenuArrangementWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
