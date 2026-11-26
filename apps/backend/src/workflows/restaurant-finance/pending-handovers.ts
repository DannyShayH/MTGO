import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"

/**
 * The delivered Orders among `order_ids` that finance has not accounted
 * for: neither recognized nor recorded as an evidence problem.
 */
export async function unaccountedHandovers(
  container: MedusaContainer,
  order_ids: string[],
  cutoff?: Date,
) {
  if (!order_ids.length) return []
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const filters = {
    source_kind: "order_delivered" as const,
    source_id: order_ids,
  }
  const [receipts, problems] = await Promise.all([
    finance.listFinanceReceipts(
      { ...filters, ...(cutoff ? { posted_at: { $lt: cutoff } } : {}) },
      { select: ["source_id"], take: null },
    ),
    finance.listFinanceProblems(
      { ...filters, ...(cutoff ? { detected_at: { $lt: cutoff } } : {}) },
      { select: ["source_id"], take: null },
    ),
  ])
  const accounted = new Set(
    [...receipts, ...problems].map(({ source_id }) => source_id),
  )
  return order_ids.filter((id) => !accounted.has(id))
}
