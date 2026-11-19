import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CUSTOMER_ORDER_DETAIL_TEXT,
  FOOD_STEPS,
  foodProgressSteps,
  type FoodProgressFacts,
} from "../customer-order-detail.ts"

const placed = "2026-11-19T11:00:00.000Z"
const accepted = "2026-11-19T11:02:00.000Z"
const started = "2026-11-19T11:04:00.000Z"
const ready = "2026-11-19T11:20:00.000Z"
const cancelledAt = "2026-11-19T11:05:00.000Z"

const awaiting: FoodProgressFacts = {
  state: "awaiting_acceptance",
  placed_at: placed,
  accepted_at: null,
  preparation_started_at: null,
  ready_at: null,
  cancellation: null,
}

/** One row per rule case: the reason, the recorded facts, the steps shown. */
const rows: {
  reason: string
  facts: FoodProgressFacts
  steps: [key: string, status: string, at: string | null][]
}[] = [
  {
    reason:
      "EP: an awaiting Order is placed, with every later step upcoming and untimed",
    facts: awaiting,
    steps: [
      ["placed", "current", placed],
      ["accepted", "upcoming", null],
      ["preparing", "upcoming", null],
      ["ready", "upcoming", null],
    ],
  },
  {
    reason:
      "EP: while preparing, earlier steps are done at their recorded times and readiness is upcoming",
    facts: {
      ...awaiting,
      state: "preparing",
      accepted_at: accepted,
      preparation_started_at: started,
    },
    steps: [
      ["placed", "completed", placed],
      ["accepted", "completed", accepted],
      ["preparing", "current", started],
      ["ready", "upcoming", null],
    ],
  },
  {
    reason:
      "BVA: ready food is the last food step and claims nothing beyond it",
    facts: {
      ...awaiting,
      state: "ready",
      accepted_at: accepted,
      preparation_started_at: started,
      ready_at: ready,
    },
    steps: [
      ["placed", "completed", placed],
      ["accepted", "completed", accepted],
      ["preparing", "completed", started],
      ["ready", "current", ready],
    ],
  },
  {
    reason:
      "EP: a cancelled Order keeps its real milestones and ends, done, in the cancellation instead of a completed food path",
    facts: {
      ...awaiting,
      state: "cancelled",
      cancellation: { effective_at: cancelledAt },
    },
    steps: [
      ["placed", "completed", placed],
      ["cancelled", "completed", cancelledAt],
    ],
  },
  {
    reason:
      "EP: a cancellation after acceptance preserves the acceptance it really had",
    facts: {
      ...awaiting,
      state: "cancelled",
      accepted_at: accepted,
      cancellation: { effective_at: cancelledAt },
    },
    steps: [
      ["placed", "completed", placed],
      ["accepted", "completed", accepted],
      ["cancelled", "completed", cancelledAt],
    ],
  },
]

for (const { reason, facts, steps } of rows)
  test(reason, () => {
    assert.deepEqual(
      foodProgressSteps(facts),
      steps.map(([key, status, at]) => ({ key, status, at })),
    )
  })

const STATES = [
  "awaiting_acceptance",
  "accepted",
  "preparing",
  "ready",
  "cancelled",
] as const

test("every step, step status and Order state has a Danish and an English text", () => {
  for (const locale of ["da", "en"] as const) {
    const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
    for (const key of [...FOOD_STEPS, "cancelled"] as const)
      assert.ok(text[`step_${key}`].trim(), `${locale}.step_${key}`)
    for (const status of ["completed", "current", "upcoming"] as const)
      assert.ok(text[`step_${status}`].trim(), `${locale}.step_${status}`)
    for (const state of STATES) {
      assert.ok(text[`now_${state}`].trim(), `${locale}.now_${state}`)
      assert.ok(text[`state_${state}`].trim(), `${locale}.state_${state}`)
    }
  }
})
