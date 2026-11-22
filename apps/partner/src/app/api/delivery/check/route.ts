import { checkDelivery } from "@lib/data/delivery-feed"

export const dynamic = "force-dynamic"

/** The workspace's polling check (#165); see `checkDelivery`. */
export async function GET() {
  const check = await checkDelivery()
  return Response.json(check, {
    status: check.status === "unavailable" ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  })
}
