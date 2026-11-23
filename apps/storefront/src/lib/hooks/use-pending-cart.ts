"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CART_CHANGE_EVENT } from "@lib/util/cart-events"
import {
  NO_PENDING,
  applyCartChange,
  cartLoaded,
  loadToken,
  type CartChange,
  type PendingCart,
} from "@lib/util/pending-cart"

/**
 * The basket changes on their way (#203) for one cart display. Wrap each
 * cart read in `track`, so it clears exactly the changes it holds.
 */
export function usePendingCart() {
  const [pending, setPending] = useState<PendingCart>(NO_PENDING)
  const ref = useRef(pending)
  const update = useCallback((next: (state: PendingCart) => PendingCart) => {
    ref.current = next(ref.current)
    setPending(ref.current)
  }, [])

  useEffect(() => {
    const onChange = (event: Event) =>
      update((state) =>
        applyCartChange(state, (event as CustomEvent<CartChange>).detail),
      )
    window.addEventListener(CART_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CART_CHANGE_EVENT, onChange)
  }, [update])

  // Reads can come back out of order; only the newest one shown so far may
  // replace the cart, so an older answer never moves the count backwards.
  const readsRef = useRef({ started: 0, shown: 0 })
  const track = useCallback(
    <T>(read: () => Promise<T>, onLoaded: (result: T) => void) => {
      const token = loadToken(ref.current)
      const id = ++readsRef.current.started
      return read().then(
        (result) => {
          if (id > readsRef.current.shown) {
            readsRef.current.shown = id
            // One render: the new cart arrives as its pending changes leave.
            onLoaded(result)
          }
          update((state) => cartLoaded(state, token))
        },
        (error: unknown) => {
          // The server confirmed these changes, so the next cart that arrives
          // (a later read or the revalidated page) holds them; counting them
          // on top of it would count them twice.
          update((state) => cartLoaded(state, token))
          throw error
        },
      )
    },
    [update],
  )

  const hasPending = useCallback(() => ref.current.changes.length > 0, [])

  return { pending, track, hasPending }
}
