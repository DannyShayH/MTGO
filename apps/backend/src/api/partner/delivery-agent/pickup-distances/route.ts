import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ROUTING_MODULE } from "../../../../modules/routing"
import type RoutingModuleService from "../../../../modules/routing/service"
import { distanceKm } from "../../../../workflows/delivery/distance"
import { listPickupPointsWorkflow } from "../../../../workflows/delivery/trip"
import type { PostPickupDistancesBody } from "../../validators"

/**
 * Route distances from the agent's position to the pickups in their
 * available or current view (#191), only while they share their location.
 * The workflow authorizes and finds the pickups without seeing the
 * position; it is used here for one provider call and then dropped: never
 * stored, logged or linked to the agent record.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostPickupDistancesBody>,
  res: MedusaResponse,
) {
  const { latitude, longitude, order_ids } = req.validatedBody
  const { result: points } = await listPickupPointsWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id, order_ids },
  })
  const known = points.filter(({ pickup }) => pickup)
  const meters = await req.scope
    .resolve<RoutingModuleService>(ROUTING_MODULE)
    .distancesFrom(
      { latitude, longitude },
      known.map(({ pickup }) => pickup!),
    )
  const measured = new Map(
    known.map(({ order_id }, index) => [order_id, meters[index]]),
  )
  res.json({
    distances: points.map(({ order_id }) => ({
      order_id,
      distance_km: distanceKm(measured.get(order_id)),
    })),
  })
}
