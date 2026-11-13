import { expect, it } from "vitest"
import { collectBoard } from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  withdrawnFeatureItems,
  createFixtureFetch,
  ACCEPTANCE_OBSERVED_AT,
} from "./fixtures/feature-board.ts"

it.each([
  {
    reason: "EP: recorded reason",
    body: "Withdrawal reason: Product direction changed",
    expected: "Product direction changed",
  },
  { reason: "EP: absent reason", body: "", expected: null },
  { reason: "EP: empty reason", body: "Withdrawal reason:   ", expected: null },
  {
    reason: "DT: conflicting reasons",
    body: "Withdrawal reason: Cost\nWithdrawal reason: Product direction",
    expected: null,
  },
  {
    reason: "EP: unsupported reason record",
    body: "Withdrawal reason — Cost",
    expected: null,
  },
])("$reason", async ({ body, expected }) => {
  const items = withdrawnFeatureItems()
  items[2].content!.body = body
  const dataset = await collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    fetch: createFixtureFetch(items),
  })
  const metrics = calculateFlowMetrics(dataset, dataset.observedAt)
  expect(metrics.features[0]).toMatchObject({
    state: "Withdrawn",
    timingState: "Available",
    withdrawalReason: expected,
    leadTimeDays: null,
    ageDays: null,
    acceptedAt: null,
    finishedAt: null,
    deliveredCount: 1,
  })
  expect(
    metrics.features[0].children.map(({ number, delivered }) => ({
      number,
      delivered,
    })),
  ).toEqual([
    { number: 2, delivered: true },
    { number: 3, delivered: false },
  ])
  expect(metrics.features[0].problems).toEqual(
    expected
      ? []
      : [
          expect.objectContaining({
            number: 103,
            problem: "Withdrawal reason is missing or ambiguous",
          }),
        ],
  )
  const withoutParent = calculateFlowMetrics(
    { ...dataset, items: dataset.items.slice(0, 2) },
    dataset.observedAt,
  )
  expect({ ...metrics, features: [] }).toEqual(withoutParent)
  expect(
    metrics.throughput.find((week) => week.start === "2026-11-16")?.count,
  ).toBe(1)
  expect(metrics.cycleTime).toMatchObject([{ number: 2, days: 1 }])
  expect(metrics.closedWithoutDelivery).toMatchObject([{ number: 3 }])
})

it.each([
  {
    reason: "DT: all children delivered before withdrawal",
    scenario: "delivered",
  },
  { reason: "EP: missing child evidence", scenario: "missing" },
  { reason: "EP: empty withdrawn Feature", scenario: "empty" },
  { reason: "EP: incomplete child links", scenario: "incomplete" },
])("$reason", async ({ scenario }) => {
  const items = withdrawnFeatureItems()
  const parent = items[2].content!
  if (scenario === "delivered") items[1].content!.stateReason = "COMPLETED"
  if (scenario === "empty") {
    parent.subIssues!.nodes = []
    parent.subIssues!.totalCount = 0
  }
  const dataset = await collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    // GitHub answers NOT_FOUND for the missing child read by its issue id
    fetch: createFixtureFetch(scenario === "missing" ? items.slice(1) : items),
  })
  if (scenario === "incomplete") {
    dataset.items.find((item) => item.number === 103)!.children = []
  }
  const feature = calculateFlowMetrics(dataset, dataset.observedAt).features[0]
  expect(feature).toMatchObject({
    state: "Withdrawn",
    timingState:
      scenario === "missing" || scenario === "incomplete"
        ? "Not available"
        : scenario === "empty"
          ? "Not started"
          : "Available",
    acceptedAt: null,
    finishedAt: null,
    leadTimeDays: null,
    ageDays: null,
  })
  if (scenario === "missing") {
    expect(feature.startedAt).toBeNull()
    expect(feature.problems).toContainEqual(
      expect.objectContaining({
        number: 2,
        problem: "Child board evidence is not available",
      }),
    )
  } else if (scenario === "incomplete") {
    expect(feature.startedAt).toBeNull()
    expect(feature.problems).toContainEqual(
      expect.objectContaining({
        number: 103,
        problem: "Direct-child evidence is not available in this dataset",
      }),
    )
  } else expect(feature.problems).toEqual([])
})
