import { BigNumberInput } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"
import { evaluateNewOrderEligibility } from "../restaurants/eligibility"

/** What the Customer saw when adding the dish, recorded on the line item. */
export type DishSnapshot = { revision: number; price: number }

export const DISH_SNAPSHOT_METADATA_KEY = "mtogo_dish"

export type BasketLine = {
  variant_id: string
  quantity: number
  snapshot: DishSnapshot | null
}

export type CurrentDish = {
  id: string
  variant_id: string
  revision: number
  price: number
  is_sold_out: boolean
}

/** Why a basket's amount is not the one DKK menu total the Customer reviewed. */
/** The one ordinary payment option this release offers. */
export const MOCK_PAYMENT_PROVIDER_ID = "pp_system_default"

export type AmountRefusalReason =
  | "currency_not_dkk"
  | "adjustment_not_allowed"
  | "delivery_charge_not_allowed"
  | "payment_amount_mismatch"
  | "payment_session_missing"
  | "payment_session_unusable"
  | "payment_provider_not_allowed"

export type BasketIssue =
  | { code: "dish_unavailable"; variant_id: string }
  | { code: "dish_sold_out"; variant_id: string }
  /** Carries the current facts so the Customer can review them again. */
  | ({ code: "dish_changed"; variant_id: string } & DishSnapshot)
  | { code: "restaurant_not_receiving_orders"; reason: string }
  | { code: "amount_not_allowed"; reason: AmountRefusalReason }

/** The cart totals that decide whether the amount is the plain menu total. */
export type BasketAmount = {
  currency_code: string
  total: BigNumberInput
  discount_total?: BigNumberInput | null
  shipping_total?: BigNumberInput | null
  promotion_count: number
  credit_line_count: number
  /** Absent until the Customer starts payment. */
  payment?: {
    amount: BigNumberInput
    currency_code: string
    sessions?: {
      amount: BigNumberInput
      currency_code: string
      provider_id: string
      status: string
    }[]
  } | null
  require_payment?: boolean
}

/**
 * One Restaurant per basket. `basket` holds the Restaurants of the lines
 * already in the cart (null for a variant that is not a Restaurant dish);
 * `incoming` is the Restaurant of the dish being added.
 */
export function decideBasketAddition(
  basket: (string | null)[],
  incoming: string | null,
): "ok" | "not_a_dish" | "other_restaurant" {
  if (!incoming) return "not_a_dish"
  return basket.some((owner) => owner && owner !== incoming)
    ? "other_restaurant"
    : "ok"
}

export const parseDishSnapshot = (value: unknown): DishSnapshot | null => {
  const raw = value as Partial<DishSnapshot> | null | undefined
  return raw &&
    Number.isInteger(raw.revision) &&
    typeof raw.price === "number" &&
    Number.isFinite(raw.price)
    ? { revision: raw.revision as number, price: raw.price }
    : null
}

const isZero = (amount?: BigNumberInput | null) =>
  amount == null || MathBN.eq(amount, 0)

/**
 * Compares the basket with the Restaurant's current published menu. Nothing
 * is repaired: every difference is returned so the Customer decides.
 */
export function reviewBasket(
  lines: BasketLine[],
  menu: CurrentDish[],
  restaurant: {
    is_active: boolean
    is_open: boolean
    delivery_postal_codes: string[]
  },
  destination_postal_code?: string,
): BasketIssue[] {
  const issues: BasketIssue[] = []
  const eligibility = evaluateNewOrderEligibility(
    restaurant,
    destination_postal_code,
  )
  if (!eligibility.receiving_new_orders && eligibility.reason)
    issues.push({
      code: "restaurant_not_receiving_orders",
      reason: eligibility.reason,
    })
  for (const line of lines) {
    const dish = menu.find(({ variant_id }) => variant_id === line.variant_id)
    if (!dish)
      issues.push({ code: "dish_unavailable", variant_id: line.variant_id })
    else if (dish.is_sold_out)
      issues.push({ code: "dish_sold_out", variant_id: line.variant_id })
    else if (
      !line.snapshot ||
      line.snapshot.revision !== dish.revision ||
      !MathBN.eq(line.snapshot.price, dish.price)
    )
      issues.push({
        code: "dish_changed",
        variant_id: line.variant_id,
        revision: dish.revision,
        price: dish.price,
      })
  }
  return issues
}

/**
 * Menu prices already include VAT and delivery, so the Customer pays exactly
 * the DKK item total: no delivery charge, promotion, gift card or other credit,
 * and a started payment must be for that same amount.
 */
export function reviewBasketAmount(amount: BasketAmount): BasketIssue[] {
  const refuse = (reason: AmountRefusalReason): BasketIssue[] => [
    { code: "amount_not_allowed", reason },
  ]
  if (amount.currency_code.toLowerCase() !== "dkk")
    return refuse("currency_not_dkk")
  if (
    amount.promotion_count > 0 ||
    amount.credit_line_count > 0 ||
    !isZero(amount.discount_total)
  )
    return refuse("adjustment_not_allowed")
  if (!isZero(amount.shipping_total))
    return refuse("delivery_charge_not_allowed")
  if (
    amount.require_payment &&
    (!amount.payment || amount.payment.sessions?.length !== 1)
  )
    return refuse("payment_session_missing")
  if (
    amount.payment &&
    (amount.payment.currency_code.toLowerCase() !== "dkk" ||
      !MathBN.eq(amount.payment.amount, amount.total))
  )
    return refuse("payment_amount_mismatch")
  for (const session of amount.payment?.sessions ?? []) {
    if (session.provider_id !== MOCK_PAYMENT_PROVIDER_ID)
      return refuse("payment_provider_not_allowed")
    if (
      session.status !== "pending" &&
      session.status !== "authorized" &&
      session.status !== "captured"
    )
      return refuse("payment_session_unusable")
    if (
      session.currency_code.toLowerCase() !== "dkk" ||
      !MathBN.eq(session.amount, amount.total)
    )
      return refuse("payment_amount_mismatch")
  }
  return []
}
