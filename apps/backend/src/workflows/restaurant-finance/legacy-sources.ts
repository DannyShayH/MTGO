import { Modules } from "@medusajs/framework/utils"
import type {
  FindConfig,
  IOrderModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import type { PlacedOrderLine } from "../order-operations/financial-basis"
import {
  legacyFinancialBasis,
  ORIGINAL_ORDER_VERSION,
  type LegacyBasis,
} from "./legacy-basis"

/** Native changes that can rewrite a purchased line's price or quantity. */
const PURCHASE_CHANGES = new Set(["edit", "claim", "exchange"])
/** A change that never applied. */
const UNAPPLIED = new Set(["canceled", "declined"])

type VersionedItem = {
  item_id: string
  version: number
  raw_quantity?: { value?: string } | null
  quantity?: number | string | null
}

/**
 * Medusa keeps one `OrderItem` row per Order version (fulfillment, delivery
 * and edits each add a version), so the original version's rows hold the
 * quantities bought. The module service generates `listOrderItems` for that
 * model; the public interface does not declare it.
 */
type VersionedOrderItems = {
  listOrderItems(
    filters: { order_id: string; version: number },
    config?: FindConfig<VersionedItem>,
  ): Promise<VersionedItem[]>
}

/**
 * Collects the durable facts legacy reconciliation may rely on (#231): the
 * native Order's lines as bought at its original version, with their exact
 * VAT-inclusive prices, and every agreement the Restaurant ever had, removed
 * ones included, so the one in force at placement can be told from today's.
 */
export async function readLegacyBasis(
  container: MedusaContainer,
  order_id: string,
  placement: { restaurant_id: string; placed_at: Date | string | null },
): Promise<LegacyBasis> {
  const orders = container.resolve<IOrderModuleService>(Modules.ORDER)
  const [found, original, changes, agreements] = await Promise.all([
    orders.listOrders(
      { id: order_id },
      { select: ["id", "currency_code", "created_at"], take: 1 },
    ),
    (orders as unknown as VersionedOrderItems).listOrderItems(
      { order_id, version: ORIGINAL_ORDER_VERSION },
      { select: ["item_id", "version", "quantity", "raw_quantity"] },
    ),
    orders.listOrderChanges(
      { order_id },
      { select: ["id", "change_type", "status"], take: null },
    ),
    container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listCommercialTermsAgreements(
        { restaurant_id: placement.restaurant_id },
        {
          select: ["id", "terms_version", "agreed_at", "deleted_at"],
          take: null,
          withDeleted: true,
        },
      ),
  ])
  const order = found[0]
  if (!order) return { status: "unverifiable", missing: ["purchase", "terms"] }
  const lines = original.length
    ? await orders.listOrderLineItems(
        { id: original.map(({ item_id }) => item_id) },
        {
          select: [
            "id",
            "variant_id",
            "unit_price",
            "raw_unit_price",
            "is_tax_inclusive",
          ],
        },
      )
    : []
  const lineOf = new Map(lines.map((line) => [line.id, line]))
  const items: PlacedOrderLine[] = original.flatMap((item) => {
    const line = lineOf.get(item.item_id)
    if (!line) return []
    return [
      {
        id: line.id,
        variant_id: line.variant_id ?? null,
        raw_unit_price: line.raw_unit_price as { value?: string },
        is_tax_inclusive: line.is_tax_inclusive,
        quantity: item.raw_quantity?.value ?? item.quantity ?? null,
      },
    ]
  })
  return legacyFinancialBasis({
    order: {
      version: ORIGINAL_ORDER_VERSION,
      edited: changes.some(
        (change) =>
          PURCHASE_CHANGES.has(change.change_type ?? "") &&
          !UNAPPLIED.has(change.status),
      ),
      currency_code: order.currency_code,
      created_at: order.created_at,
      // A line missing from the original version is not reproducible.
      items: items.length === original.length ? items : [],
    },
    placed_at: placement.placed_at,
    agreements,
  })
}
