import { randomBytes } from "node:crypto"
import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createRestaurantWorkflow,
  listRestaurantsWorkflow,
} from "../workflows/restaurants"
import { createAuthorizedStaffWorkflow } from "../workflows/restaurant-staff"

const API = "http://127.0.0.1:9000"
const RESTAURANT = "Monitoring stream demo"

/**
 * Holds one real kitchen feed open on the disposable monitoring app, then
 * disconnects, so a Viewer sees one active stream and then one `disconnected`
 * termination (#173). Each run signs in as a new synthetic staff member with a
 * random password that is never printed.
 */
export default async function observeLocalStream({ container }: ExecArgs) {
  if (process.env.MTOGO_MONITORING_DEMO !== "1")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This demonstration requires the disposable monitoring app",
    )
  const holdSeconds = Number(process.env.STREAM_HOLD_SECONDS ?? 45)
  if (!Number.isInteger(holdSeconds) || holdSeconds < 1 || holdSeconds > 600)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "STREAM_HOLD_SECONDS must be a whole number from 1 to 600",
    )

  const { result } = await listRestaurantsWorkflow(container).run({
    input: { q: RESTAURANT, limit: 1, offset: 0 },
  })
  const restaurantId =
    result.restaurants[0]?.id ??
    (
      await createRestaurantWorkflow(container).run({
        input: {
          name: RESTAURANT,
          address_street: "Syntetisk Vej 1",
          address_postal_code: "2200",
          address_city: "København N",
          contact_phone: "+45 00 00 00 00",
          contact_email: "stream-demo@example.test",
        },
      })
    ).result.restaurant.id

  const email = `stream-demo-${Date.now()}@example.test`
  const password = randomBytes(18).toString("hex")
  const { authIdentity } = await container
    .resolve(Modules.AUTH)
    .register("emailpass", { body: { email, password } })
  if (!authIdentity)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The synthetic staff login was not registered",
    )
  await createAuthorizedStaffWorkflow(container).run({
    input: {
      restaurant_id: restaurantId,
      name: "Stream Demo",
      email,
      auth_identity_id: authIdentity.id,
    },
  })
  const signIn = await fetch(`${API}/auth/restaurant_staff/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  })
  const { token } = (await signIn.json()) as { token?: string }
  if (!token)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "The synthetic staff member could not sign in",
    )

  const controller = new AbortController()
  const stream = await fetch(`${API}/partner/orders/stream`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    signal: controller.signal,
  })
  const reader = stream.body?.getReader()
  const firstChunk = reader && (await reader.read()).value
  if (
    !reader ||
    stream.status !== 200 ||
    !new TextDecoder().decode(firstChunk).includes("event: ready")
  )
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "The kitchen feed did not open",
    )
  // Keep reading so the feed's heartbeats are consumed, then disconnect.
  const draining = (async () => {
    try {
      while (!(await reader.read()).done);
    } catch (error) {
      // Only the deliberate disconnect below ends the feed quietly.
      if ((error as Error).name !== "AbortError") throw error
    }
  })()
  await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1000))
  controller.abort()
  await draining
}
