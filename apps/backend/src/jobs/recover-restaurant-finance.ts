import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverRestaurantFinanceWorkflow } from "../workflows/restaurant-finance/recognition"
import { accrueServiceFeesWorkflow } from "../workflows/restaurant-finance/service-fee-accrual"

/**
 * Recognizes the current month's delivered Orders whose recognition the
 * handover request could not finish (#227), and accrues each Restaurant's
 * current-month service fee, including every new date after midnight
 * (#228). Both read only durable records, so the first tick after a worker
 * starts is the startup reconciliation. They run independently: a failure
 * of one never skips the other, and is still reported. They run whether or
 * not Restaurant statements are released (ADR-0022).
 */
export default async function recoverRestaurantFinance(
  container: MedusaContainer,
) {
  const results = await Promise.allSettled([
    recoverRestaurantFinanceWorkflow(container).run({ input: {} }),
    accrueServiceFeesWorkflow(container).run({ input: {} }),
  ])
  for (const result of results)
    if (result.status === "rejected") throw result.reason
}

export const config = {
  name: "recover-restaurant-finance",
  schedule: "* * * * *",
}
