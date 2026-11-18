import { checkOrders } from "@lib/data/order-feed"

export const dynamic = "force-dynamic"

/** The kitchen screen's polling check (#148); see `checkOrders`. */
export async function GET() {
  const check = await checkOrders()
  return Response.json(check, {
    status: check.status === "unavailable" ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  })
}
