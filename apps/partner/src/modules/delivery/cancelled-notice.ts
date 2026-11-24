/** How long the workspace explains a cancelled current delivery (#199). */
export const CANCELLED_NOTICE_MS = 30 * 60 * 1000

type Ended = { outcome: "delivered" | "cancelled" | "failed"; ended_at: string }

/**
 * The agent's newest ended delivery when an operator cancelled it under them
 * recently, so the workspace can say why the current delivery is gone and
 * the agent stops travelling. Older or other outcomes say nothing.
 */
export function recentlyCancelled<T extends Ended>(
  newest: T | null | undefined,
  now: Date,
): T | null {
  if (newest?.outcome !== "cancelled") return null
  const age = now.getTime() - new Date(newest.ended_at).getTime()
  return age >= 0 && age < CANCELLED_NOTICE_MS ? newest : null
}
