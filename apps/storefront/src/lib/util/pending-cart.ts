/**
 * Basket changes shown before the cart read that holds them (#203), so the
 * header badge and the phone basket bar count a dish at the tap instead of
 * when the revalidated page arrives.
 *
 * A change begins at the tap, settles when the server confirmed it and fails
 * otherwise (taking its count back). A settled change stays counted until a
 * cart read that started after it settled comes back: an earlier read may not
 * hold it yet, and dropping it then would make the count jump back and forth.
 */
export type CartDelta = { count: number; total: number }

export type CartChange =
  | {
      type: "begin"
      id: string
      delta: CartDelta
      /** A removal hides its line at the tap (#252). */
      removesLine?: string
    }
  | { type: "settle"; id: string }
  | { type: "fail"; id: string }

type Pending = {
  id: string
  delta: CartDelta
  removesLine?: string
  settledAt: number | null
}

export type PendingCart = { changes: Pending[]; clock: number }

export const NO_PENDING: PendingCart = { changes: [], clock: 0 }

export function applyCartChange(
  state: PendingCart,
  change: CartChange,
): PendingCart {
  if (change.type === "begin")
    return {
      ...state,
      changes: [
        ...state.changes,
        {
          id: change.id,
          delta: change.delta,
          removesLine: change.removesLine,
          settledAt: null,
        },
      ],
    }
  if (!state.changes.some(({ id }) => id === change.id)) return state
  if (change.type === "fail")
    return {
      ...state,
      changes: state.changes.filter(({ id }) => id !== change.id),
    }
  const clock = state.clock + 1
  return {
    clock,
    changes: state.changes.map((pending) =>
      pending.id === change.id ? { ...pending, settledAt: clock } : pending,
    ),
  }
}

/** Taken when a cart read starts; pass it to `cartLoaded` when it returns. */
export const loadToken = (state: PendingCart) => state.clock

/** A cart read came back: changes settled before it started are in it. */
export function cartLoaded(state: PendingCart, token: number): PendingCart {
  const changes = state.changes.filter(
    ({ settledAt }) => settledAt === null || settledAt > token,
  )
  return changes.length === state.changes.length ? state : { ...state, changes }
}

/**
 * The basket lines a removal on its way hides: from the tap until a cart read
 * that no longer holds them, or until the server refused the removal.
 */
export const removedLines = (state: PendingCart): Set<string> =>
  new Set(state.changes.flatMap(({ removesLine }) => removesLine ?? []))

/** Kroner to whole øre: amounts are summed as integers, never as floats. */
const toOre = (kroner: number) => Math.round(kroner * 100)

/**
 * The loaded basket's count and total with the changes still on their way.
 * The total is for display only; checkout always uses the server's total.
 */
export function withPending(loaded: CartDelta, state: PendingCart): CartDelta {
  const pending = state.changes.reduce(
    (sum, { delta }) => ({
      count: sum.count + delta.count,
      ore: sum.ore + toOre(delta.total),
    }),
    { count: 0, ore: 0 },
  )
  return {
    count: Math.max(0, loaded.count + pending.count),
    total: Math.max(0, toOre(loaded.total) + pending.ore) / 100,
  }
}
