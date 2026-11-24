import { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { PublishedDish } from "../menu/published-menu"
import {
  loadFoodInformationTranslator,
  type Bilingual,
  type FoodInformation,
} from "../menu/food-information"

/**
 * What the kitchen needs of one purchased dish, as reviewed before payment:
 * its Danish and English names and its structured declarations. Quantities
 * and prices stay in Medusa's own Order line items.
 */
export type PurchasedItem = {
  variant_id: string
  /** Which dish and revision the Customer reviewed, kept for audit only. */
  dish_id: string
  revision: number
  name: Bilingual
} & FoodInformation

/** An Order line's kitchen facts; `unavailable` when placement predates them. */
export type KitchenFacts =
  | ({ status: "preserved"; name: Bilingual } & FoodInformation)
  | { status: "unavailable" }

const isBilingual = (value: unknown): value is Bilingual => {
  const name = value as Partial<Bilingual> | null
  return !!name && typeof name.da === "string" && typeof name.en === "string"
}

const isPurchasedItem = (value: unknown): value is PurchasedItem => {
  const item = value as Partial<PurchasedItem> | null
  const allergens = item?.allergens as { status?: unknown } | undefined
  return (
    !!item &&
    typeof item.variant_id === "string" &&
    isBilingual(item.name) &&
    (allergens?.status === "unknown" || allergens?.status === "supplied") &&
    Array.isArray(item.labels)
  )
}

/**
 * Reads a stored JSON list of purchased items, keeping each well-formed entry
 * so one damaged entry cannot hide the others. Anything other than a list,
 * including a missing value, is null: the facts are unavailable, never guessed.
 */
export const parsePurchasedItems = (value: unknown): PurchasedItem[] | null =>
  Array.isArray(value) ? value.filter(isPurchasedItem) : null

export const orderOperationsOf = (container: MedusaContainer) =>
  container.resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)

/** The model types a JSON column as a record; the stored value is the list. */
export const toJsonColumn = (items: PurchasedItem[] | null) =>
  items as unknown as Record<string, unknown> | null

/**
 * Freezes the kitchen facts of a basket that passed the server review. The
 * review only passes when each line's reviewed revision is the dish's current
 * one, so these are the facts the Customer reviewed. Runs under the cart lock
 * and replaces any earlier review of the same, still incomplete, cart.
 */
export async function freezePurchaseReview(
  container: MedusaContainer,
  cartId: string,
  dishes: PublishedDish[],
) {
  const translateFoodInformation = await loadFoodInformationTranslator(
    container,
    dishes,
  )
  const items: PurchasedItem[] = dishes.map((dish) => ({
    variant_id: dish.variant_id,
    dish_id: dish.id,
    revision: dish.revision,
    name: dish.name,
    ...translateFoodInformation(dish),
  }))
  const service = orderOperationsOf(container)
  const [existing] = await service.listPurchaseReviews(
    { cart_id: cartId },
    { select: ["id", "items", "reviewed_at"], take: 1 },
  )
  const review = { items: toJsonColumn(items)!, reviewed_at: new Date() }
  if (existing) {
    await service.updatePurchaseReviews({ id: existing.id, ...review })
    return { id: existing.id, previous: existing }
  }
  const created = await service.createPurchaseReviews({
    cart_id: cartId,
    ...review,
  })
  return { id: created.id, previous: null }
}

export type FrozenPurchaseChange = Awaited<
  ReturnType<typeof freezePurchaseReview>
>

/** Undoes a freeze when completion fails after it: restores or removes the review. */
export async function restorePurchaseReview(
  container: MedusaContainer,
  change: FrozenPurchaseChange,
) {
  const service = orderOperationsOf(container)
  if (change.previous)
    await service.updatePurchaseReviews({
      id: change.id,
      items: change.previous.items,
      reviewed_at: change.previous.reviewed_at,
    })
  else await service.deletePurchaseReviews(change.id)
}

/** Reads the cart's frozen review, to copy onto the Order at placement. */
export async function readFrozenPurchase(
  container: MedusaContainer,
  cartId: string,
): Promise<{ id: string; items: PurchasedItem[] | null } | null> {
  const service = orderOperationsOf(container)
  const [review] = await service.listPurchaseReviews(
    { cart_id: cartId },
    { select: ["id", "items"], take: 1 },
  )
  return review
    ? { id: review.id, items: parsePurchasedItems(review.items) }
    : null
}

/** Joins an Order line to its purchased dish by variant; older Orders have none. */
export function toKitchenFacts(
  purchased: unknown,
  variantId?: string | null,
): KitchenFacts {
  const item = parsePurchasedItems(purchased)?.find(
    (entry) => entry.variant_id === variantId,
  )
  return item
    ? {
        status: "preserved",
        name: item.name,
        allergens: item.allergens,
        labels: item.labels,
      }
    : { status: "unavailable" }
}
