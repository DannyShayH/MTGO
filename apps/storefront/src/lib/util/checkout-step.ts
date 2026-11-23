/**
 * The checkout's steps in order, and which one is open. The address's `step`
 * only chooses among the steps the cart has reached, so a link without a
 * step, or to a step that is not ready, still opens one; without this the
 * page could show every step closed and the Customer could not go on.
 */
export const CHECKOUT_STEPS = [
  "address",
  "delivery",
  "payment",
  "review",
] as const
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

/** The fields of a store cart the steps depend on. */
export type CheckoutCart = {
  email?: string | null
  shipping_address?: { address_1?: string | null } | null
  shipping_methods?: unknown[] | null
  payment_collection?: { payment_sessions?: unknown[] | null } | null
}

/**
 * Whether the Customer entered a delivery address. A new cart already has an
 * address holding only its region's country, which is not one.
 */
export const hasDeliveryAddress = (cart: CheckoutCart) =>
  Boolean(cart.shipping_address?.address_1?.trim() && cart.email)

/** The furthest step the cart allows: the first one not yet done. */
export function reachedCheckoutStep(cart: CheckoutCart): CheckoutStep {
  if (!hasDeliveryAddress(cart)) return "address"
  if (!cart.shipping_methods?.length) return "delivery"
  if (!cart.payment_collection?.payment_sessions?.length) return "payment"
  return "review"
}

/** The requested step when the cart has reached it, else the cart's step. */
export function openCheckoutStep(
  requested: string | null,
  cart: CheckoutCart,
): CheckoutStep {
  const reached = reachedCheckoutStep(cart)
  const index = CHECKOUT_STEPS.indexOf(requested as CheckoutStep)
  return index >= 0 && index <= CHECKOUT_STEPS.indexOf(reached)
    ? (requested as CheckoutStep)
    : reached
}
