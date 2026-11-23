export type BasketLine = { lineId: string; quantity: number }

/** A line as the server confirmed it; no line once the quantity is 0. */
export type ConfirmedLine = { lineId: string | null; quantity: number }

/**
 * A dish's basket control state on the menu (#203). `seen` is the last
 * `line` the page passed in; `lineId`/`quantity` are what the server last
 * confirmed, which is what the control shows. `isAhead` is true while that
 * confirmation has not reached the page yet.
 */
export type LineState = ConfirmedLine & {
  seen: BasketLine | null
  isAhead: boolean
}

const sameLine = (a: ConfirmedLine | null, b: ConfirmedLine | null) =>
  (a?.quantity ? a.lineId : null) === (b?.quantity ? b.lineId : null) &&
  (a?.quantity ?? 0) === (b?.quantity ?? 0)

export const initialLineState = (line: BasketLine | null): LineState => ({
  seen: line,
  lineId: line?.lineId ?? null,
  quantity: line?.quantity ?? 0,
  isAhead: false,
})

/**
 * Takes the page's `line` only when it changed since the last render, and,
 * while a confirmation is ahead of the page, only once the page catches up
 * with it. After an add the page keeps passing its old `null`, and a step
 * made right after the add meets a page that still shows the add's quantity;
 * taking either would put the "Add" pill or the old count back for a moment
 * (the flicker in #203). Returns the same state when nothing changes, so a
 * render can compare by identity.
 */
export function withLineProp(
  state: LineState,
  line: BasketLine | null,
): LineState {
  if (sameLine(state.seen, line)) return state
  if (state.isAhead && !sameLine(state, line)) return { ...state, seen: line }
  return initialLineState(line)
}

/** What the server just confirmed; the page's `line` catches up later. */
export const confirmLine = (
  state: LineState,
  next: ConfirmedLine,
): LineState => ({
  seen: state.seen,
  lineId: next.quantity > 0 ? next.lineId : null,
  quantity: next.quantity,
  isAhead: true,
})
