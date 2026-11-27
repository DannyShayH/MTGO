import type { MedusaContainer } from "@medusajs/framework/types"
import { drainRestaurantFinance } from "../workflows/restaurant-finance/reconciliation"

/**
 * The once-per-minute finance reconciliation (#234): closes ended months,
 * recognizes delivered and cancelled Orders whose follow-up never finished,
 * and accrues each Restaurant's current-month service fee, including every
 * new date after midnight. It reads only durable records, so the first tick
 * after a worker starts is the startup reconciliation, and it drains several
 * bounded batches per tick. It runs whether or not Restaurant statements are
 * released (ADR-0022).
 */
export default async function recoverRestaurantFinance(
  container: MedusaContainer,
) {
  await drainRestaurantFinance(container)
}

export const config = {
  name: "recover-restaurant-finance",
  schedule: "* * * * *",
}
