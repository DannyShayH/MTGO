import type { CheckoutStep } from "./checkout-step"

/**
 * Opens a checkout step at the click (#252). The step lives in the address,
 * and every step already has the cart it shows, so only the address changes:
 * `router.push` would render the whole checkout on the server again first,
 * reading the cart, the Customer, delivery and payment options. Next.js keeps
 * `useSearchParams` in step with `history.pushState`, and Back still works.
 */
export function showCheckoutStep(step: CheckoutStep) {
  const url = new URL(window.location.href)
  url.searchParams.set("step", step)
  window.history.pushState(null, "", url)
}
