import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverRestaurantFinanceWorkflow } from "../workflows/restaurant-finance/recognition"

/**
 * Recognizes the current month's delivered Orders whose recognition the
 * handover request could not finish (#227). It reads only durable records,
 * so the first tick after a worker starts is the startup reconciliation.
 * It runs whether or not Restaurant statements are released (ADR-0022).
 */
export default async function recoverRestaurantFinance(
  container: MedusaContainer,
) {
  await recoverRestaurantFinanceWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-restaurant-finance",
  schedule: "* * * * *",
}
