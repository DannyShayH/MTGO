import type { RestaurantOrder } from "../../lib/data/orders.ts"

export type TimelineOrder = Pick<
  RestaurantOrder,
  | "placed_at"
  | "accepted_at"
  | "preparation_started_at"
  | "ready_at"
  | "delivery"
>

export type TimelineStep = {
  key:
    | "placed"
    | "accepted"
    | "preparation"
    | "ready"
    | "picked_up"
    | "delivered"
    | "not_delivered"
  time: string
}

/**
 * The milestones the backend recorded, oldest first: the kitchen's own,
 * then the agent's pickup (#254) and how the delivery ended (#204). Only
 * times; the agent is never named (ADR-0008).
 */
export function orderTimelineSteps(order: TimelineOrder): TimelineStep[] {
  const { delivery } = order
  const steps: (readonly [TimelineStep["key"], string | null | undefined])[] = [
    ["placed", order.placed_at],
    ["accepted", order.accepted_at],
    ["preparation", order.preparation_started_at],
    ["ready", order.ready_at],
    ["picked_up", delivery?.picked_up_at],
    ...(delivery?.outcome
      ? [[delivery.outcome, delivery.ended_at] as const]
      : []),
  ]
  return steps.flatMap(([key, time]) => (time ? [{ key, time }] : []))
}
