import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { orderTimelineSteps, type TimelineOrder } from "../timeline-steps.ts"

const PLACED = "2026-11-26T10:55:00.000Z"
const ACCEPTED = "2026-11-26T10:55:10.000Z"
const PREPARING = "2026-11-26T10:55:20.000Z"
const READY = "2026-11-26T10:55:30.000Z"
const PICKED_UP = "2026-11-26T10:56:00.000Z"
const ENDED = "2026-11-26T10:58:00.000Z"

const ready: TimelineOrder = {
  placed_at: PLACED,
  accepted_at: ACCEPTED,
  preparation_started_at: PREPARING,
  ready_at: READY,
  delivery: null,
}
const kitchenSteps = [
  { key: "placed", time: PLACED },
  { key: "accepted", time: ACCEPTED },
  { key: "preparation", time: PREPARING },
  { key: "ready", time: READY },
]

const cases: {
  reason: string
  order: TimelineOrder
  steps: { key: string; time: string }[]
}[] = [
  {
    reason: "EP: ready food not yet collected ends at Ready",
    order: ready,
    steps: kitchenSteps,
  },
  {
    reason:
      "EP: collected food adds the pickup after Ready, at the pickup time",
    order: {
      ...ready,
      delivery: { picked_up_at: PICKED_UP, outcome: null, ended_at: null },
    },
    steps: [...kitchenSteps, { key: "picked_up", time: PICKED_UP }],
  },
  {
    reason:
      "EP: a delivered Order reads Placed, Accepted, Preparation started, Ready, Collected, Delivered",
    order: {
      ...ready,
      delivery: {
        picked_up_at: PICKED_UP,
        outcome: "delivered",
        ended_at: ENDED,
      },
    },
    steps: [
      ...kitchenSteps,
      { key: "picked_up", time: PICKED_UP },
      { key: "delivered", time: ENDED },
    ],
  },
  {
    reason:
      "EP: a delivery that ended before pickup goes from Ready to Not delivered",
    order: {
      ...ready,
      delivery: {
        picked_up_at: null,
        outcome: "not_delivered",
        ended_at: ENDED,
      },
    },
    steps: [...kitchenSteps, { key: "not_delivered", time: ENDED }],
  },
  {
    reason: "EP: a legacy Order without milestones has no steps",
    order: {
      placed_at: null,
      accepted_at: null,
      preparation_started_at: null,
      ready_at: null,
      delivery: null,
    },
    steps: [],
  },
]

describe("the steps of a Restaurant's Order timeline", () => {
  for (const { reason, order, steps } of cases)
    it(reason, () => {
      assert.deepEqual(orderTimelineSteps(order), steps)
    })
})
