import {
  ATTENTION_TYPES,
  type AttentionType,
} from "../../modules/delivery/models/delivery-attention"
import { UNASSIGNED_ATTENTION_MS } from "../delivery/attention-rules"

/**
 * The moment before which an unassigned delivery has waited over ten minutes
 * (#260): its acceptance must be strictly earlier. The same ten minutes as
 * the #49 unassigned attention deadline, so both name the same Orders.
 */
export const unassignedWaitingCutoff = (now: Date) =>
  new Date(now.getTime() - UNASSIGNED_ATTENTION_MS)

/** Open Orders whose delivery has no agent, and those waiting over ten minutes. */
export const unassignedDeliveriesFigure = (
  counts: { total: number; waiting: number },
  at: string,
) => ({
  // A state at one moment, not a range of time.
  period: { at },
  total: counts.total,
  waiting_over_ten_minutes: counts.waiting,
  // Every delivery records its acceptance, so none is left out.
  exclusions: [],
})

export type AttentionCount = {
  type: AttentionType
  count: number
  /** Of these, the items on Orders counted as waiting over ten minutes. */
  waiting_unassigned: number
}

/**
 * Raised, unresolved attention items by type (#49 definitions), every type
 * named in the deliveries page order. The unassigned entry states how many
 * of its items are the same Orders as the unassigned deliveries waiting over
 * ten minutes, so one Order is never read as two problems.
 */
export const attentionFigure = (rows: AttentionCount[], at: string) => {
  const byType = new Map(rows.map((row) => [row.type, row]))
  const types = ATTENTION_TYPES.map((type) => {
    const row = byType.get(type)
    const count = row?.count ?? 0
    return type === "unassigned"
      ? { type, count, waiting_unassigned_orders: row?.waiting_unassigned ?? 0 }
      : { type, count }
  })
  return {
    period: { at },
    total: types.reduce((sum, { count }) => sum + count, 0),
    types,
    exclusions: [],
  }
}

/** Full refunds still owed: waiting (pending) apart from broken (failed). */
export const fullRefundFigure = (
  counts: { pending: number; failed: number },
  at: string,
) => ({
  period: { at },
  total: counts.pending + counts.failed,
  pending: counts.pending,
  failed: counts.failed,
  exclusions: [],
})
