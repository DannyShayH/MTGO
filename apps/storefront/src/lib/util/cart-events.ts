import type { CartChange, CartDelta } from "./pending-cart"

export const CART_UPDATED_EVENT = "medusa:cart-updated"

/** A basket change shown at the tap, before the cart read that holds it (#203). */
export const CART_CHANGE_EVENT = "mtogo:cart-change"

/** Lets client-loaded cart UI refresh after a mutation on statically rendered pages. */
export const notifyCartUpdated = () => {
  window.dispatchEvent(new Event(CART_UPDATED_EVENT))
}

const announce = (change: CartChange) =>
  window.dispatchEvent(new CustomEvent(CART_CHANGE_EVENT, { detail: change }))

let lastId = 0

/**
 * Counts a change on the badge and the basket bar now. Call `settle` once the
 * server confirmed it (then `notifyCartUpdated`), or `fail` to take it back.
 * A removal names its line, so the basket hides it at the tap too (#252).
 */
export function beginCartChange(
  delta: CartDelta,
  options: { removesLine?: string } = {},
) {
  const id = `change_${++lastId}`
  announce({ type: "begin", id, delta, removesLine: options.removesLine })
  return {
    settle: () => announce({ type: "settle", id }),
    fail: () => announce({ type: "fail", id }),
  }
}
