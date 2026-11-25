import assert from "node:assert/strict"
import { test } from "node:test"
import { acceptProgress } from "../confirmed-progress.ts"
import type { OrderProgress } from "@lib/data/orders"

const progress: OrderProgress = {
  order_id: "order_1",
  state: "ready",
  placed_at: "placed",
  accepted_at: "accepted",
  preparation_started_at: "started",
  ready_at: "ready",
  delivery: {
    assigned_at: "assigned",
    picked_up_at: "pickup",
    delivered_at: "delivered",
    ended_at: "delivered",
    outcome: "delivered",
    location: {
      state: "ended",
      latitude: null,
      longitude: null,
      accuracy_m: null,
      observed_at: null,
      received_at: null,
      stale_at: null,
      revision: null,
    },
  },
  follow_up: { status: "pending" },
  available_actions: [],
  cancellation: null,
  refund: null,
}
const confirmed = { progress, server_time: "2026-01-01T00:00:10Z" }

const cases: Array<{
  reason: string
  next: typeof confirmed
  accepted: boolean
}> = [
  {
    reason: "DT: newer consistent projection settles follow-up",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: { ...progress, follow_up: { status: "settled" } },
    },
    accepted: true,
  },
  {
    reason: "BVA: older server time is rejected",
    next: { ...confirmed, server_time: "2026-01-01T00:00:09Z" },
    accepted: false,
  },
  {
    reason: "DT: recorded ready time cannot disappear",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: { ...progress, ready_at: null },
    },
    accepted: false,
  },
  {
    reason: "DT: recorded acceptance cannot change",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: { ...progress, accepted_at: "different" },
    },
    accepted: false,
  },
  {
    reason: "DT: assignment cannot disappear",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: {
        ...progress,
        delivery: { ...progress.delivery!, assigned_at: null },
      },
    },
    accepted: false,
  },
  {
    reason: "DT: terminal location cannot return",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: {
        ...progress,
        delivery: {
          ...progress.delivery!,
          location: {
            ...progress.delivery!.location,
            state: "fresh",
            latitude: 55,
          },
        },
      },
    },
    accepted: false,
  },
  {
    reason: "DT: terminal outcome cannot disappear",
    next: {
      ...confirmed,
      server_time: "2026-01-01T00:00:20Z",
      progress: {
        ...progress,
        delivery: { ...progress.delivery!, outcome: null },
      },
    },
    accepted: false,
  },
]

for (const { reason, next, accepted } of cases) {
  test(reason, () => {
    assert.equal(acceptProgress(confirmed, next), accepted ? next : confirmed)
  })
}
