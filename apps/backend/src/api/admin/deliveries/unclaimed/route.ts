import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listUnclaimedDeliveriesWorkflow } from "../../../../workflows/delivery/assignment"
import type { ListUnclaimedDeliveriesQuery } from "../validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListUnclaimedDeliveriesQuery>,
  res: MedusaResponse,
) {
  const { result } = await listUnclaimedDeliveriesWorkflow(req.scope).run({
    input: req.validatedQuery as ListUnclaimedDeliveriesQuery,
  })
  res.json(result)
}
