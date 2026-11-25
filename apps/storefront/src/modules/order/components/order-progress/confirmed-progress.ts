import type { OrderProgress } from "@lib/data/orders"

export type ConfirmedProgress = { progress: OrderProgress; server_time: string }

/** Recorded facts cannot disappear or acquire a different time on reread. */
const preserves = (
  previous: string | null | undefined,
  next: string | null | undefined,
) => previous == null || previous === next

/** Reject stale or inconsistent projections instead of undoing confirmed facts. */
export function acceptProgress(
  current: ConfirmedProgress | null,
  next: ConfirmedProgress,
): ConfirmedProgress {
  if (!current || current.progress.order_id !== next.progress.order_id)
    return next
  const before = current.progress
  const after = next.progress
  if (Date.parse(current.server_time) > Date.parse(next.server_time))
    return current
  if (
    !preserves(before.placed_at, after.placed_at) ||
    !preserves(before.accepted_at, after.accepted_at) ||
    !preserves(before.preparation_started_at, after.preparation_started_at) ||
    !preserves(before.ready_at, after.ready_at) ||
    !preserves(before.delivery?.assigned_at, after.delivery?.assigned_at) ||
    !preserves(before.delivery?.picked_up_at, after.delivery?.picked_up_at) ||
    !preserves(before.delivery?.delivered_at, after.delivery?.delivered_at) ||
    !preserves(before.delivery?.ended_at, after.delivery?.ended_at) ||
    !preserves(before.delivery?.outcome, after.delivery?.outcome) ||
    !preserves(
      before.cancellation?.effective_at,
      after.cancellation?.effective_at,
    ) ||
    (before.state === "cancelled" && after.state !== "cancelled") ||
    (!!before.delivery?.outcome && after.delivery?.location.state !== "ended")
  )
    return current
  return next
}
