import { describe, expect, it } from "vitest"
import { collectBoard, normaliseBoard } from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  acceptedFeatureItems,
  ACCEPTANCE_OBSERVED_AT,
  featureBoardResponse,
} from "./fixtures/feature-board.ts"

async function observe(
  items = acceptedFeatureItems(),
  observedAt = ACCEPTANCE_OBSERVED_AT,
) {
  const dataset = await collectBoard({
    token: "fixture-token",
    now: () => observedAt,
    fetch: async () =>
      new Response(JSON.stringify(featureBoardResponse(items))),
  })
  return calculateFlowMetrics(dataset, observedAt).features[0]
}

describe("accepted Feature lead time", () => {
  it("measures 16 to 20 November only after human acceptance on 23 November", async () => {
    expect(await observe()).toMatchObject({
      state: "Completed",
      startedAt: "2026-11-16",
      finishedAt: "2026-11-20",
      acceptedAt: "2026-11-23T12:00:00Z",
      leadTimeDays: 4,
      ageDays: null,
      requiredCount: 2,
      deliveredCount: 2,
      problems: [],
    })
    const items = acceptedFeatureItems()
    Object.assign(items[2].content!, {
      state: "OPEN",
      stateReason: null,
      closedAt: null,
    })
    items[2].content!.timelineItems!.nodes = []
    expect(await observe(items)).toMatchObject({
      state: "Awaiting acceptance",
      leadTimeDays: null,
      ageDays: 9,
      acceptedAt: null,
    })
  })
})

it.each([
  {
    reason: "DT: parent remains closed before delivery",
    acceptance: "2026-11-19T12:00:00Z",
    reopened: false,
    childOpen: false,
    expectedState: "Awaiting acceptance",
    expectedDays: null,
  },
  {
    reason: "DT: reopened child and still-closed parent",
    acceptance: "2026-11-23T12:00:00Z",
    reopened: true,
    childOpen: true,
    expectedState: "Reopened",
    expectedDays: null,
  },
  {
    reason: "DT: child redelivery alone cannot renew parent acceptance",
    acceptance: "2026-11-23T12:00:00Z",
    reopened: true,
    childOpen: false,
    expectedState: "Reopened",
    expectedDays: null,
  },
  {
    reason: "DT: renewed acceptance after redelivery preserves original start",
    acceptance: "2026-11-25T11:00:00Z",
    reopened: true,
    childOpen: false,
    expectedState: "Completed",
    expectedDays: 8,
  },
])(
  "$reason",
  async ({ acceptance, reopened, childOpen, expectedState, expectedDays }) => {
    const items = acceptedFeatureItems()
    items[2].content!.closedAt = acceptance
    if (reopened) {
      const child = items[1].content!
      child.state = childOpen ? "OPEN" : "CLOSED"
      child.closedAt = childOpen ? null : "2026-11-24T12:00:00Z"
      child.timelineItems!.nodes.push({
        __typename: "ReopenedEvent",
        createdAt: "2026-11-24T09:00:00Z",
      })
      if (!childOpen)
        child.timelineItems!.nodes.push({
          __typename: "ClosedEvent",
          createdAt: child.closedAt!,
        })
    }
    const feature = await observe(items)
    expect(feature).toMatchObject({
      state: expectedState,
      startedAt: "2026-11-16",
      leadTimeDays: expectedDays,
    })
    if (expectedDays === null) {
      expect(feature.acceptedAt).toBeNull()
      expect(feature.problems).toContainEqual(
        expect.objectContaining({
          number: 103,
          problem: expect.stringMatching(/parent acceptance/i),
        }),
      )
    }
  },
)

it.each([
  {
    reason: "BVA: same Copenhagen day",
    start: "2026-11-20",
    finish: "2026-11-20T12:00:00Z",
    days: 0,
  },
  {
    reason: "BVA: one minute before Copenhagen winter midnight",
    start: "2026-11-20",
    finish: "2026-11-20T22:59:00Z",
    days: 0,
  },
  {
    reason: "BVA: Copenhagen winter midnight",
    start: "2026-11-20",
    finish: "2026-11-20T23:00:00Z",
    days: 1,
  },
  {
    reason: "BVA: one minute after Copenhagen winter midnight",
    start: "2026-11-20",
    finish: "2026-11-20T23:01:00Z",
    days: 1,
  },
  {
    reason: "BVA: one minute before summer midnight before autumn change",
    start: "2026-10-24",
    finish: "2026-10-24T21:59:00Z",
    days: 0,
  },
  {
    reason: "BVA: summer midnight before autumn change",
    start: "2026-10-24",
    finish: "2026-10-24T22:00:00Z",
    days: 1,
  },
  {
    reason: "BVA: one minute after summer midnight before autumn change",
    start: "2026-10-24",
    finish: "2026-10-24T22:01:00Z",
    days: 1,
  },
  {
    reason: "BVA: one minute before Copenhagen day across autumn change",
    start: "2026-10-24",
    finish: "2026-10-25T22:59:00Z",
    days: 1,
  },
  {
    reason: "BVA: Copenhagen day across autumn change",
    start: "2026-10-24",
    finish: "2026-10-25T23:00:00Z",
    days: 2,
  },
  {
    reason: "BVA: one minute after Copenhagen day across autumn change",
    start: "2026-10-24",
    finish: "2026-10-25T23:01:00Z",
    days: 2,
  },
  {
    reason: "BVA: one minute before spring change",
    start: "2026-03-28",
    finish: "2026-03-29T21:59:00Z",
    days: 1,
  },
  {
    reason: "BVA: spring change",
    start: "2026-03-28",
    finish: "2026-03-29T22:00:00Z",
    days: 2,
  },
  {
    reason: "BVA: one minute after spring change",
    start: "2026-03-28",
    finish: "2026-03-29T22:01:00Z",
    days: 2,
  },
])("$reason", async ({ start, finish, days }) => {
  const items = acceptedFeatureItems()
  for (const child of items.slice(0, 2)) {
    child.fieldValues.nodes[1].date = start
    child.content!.closedAt = finish
  }
  expect(await observe(items)).toMatchObject({
    state: "Completed",
    leadTimeDays: days,
    ageDays: null,
  })
})

it.each([
  { reason: "EP: missing delivered start", field: "start", value: null },
  { reason: "EP: malformed delivered start", field: "start", value: "soon" },
  {
    reason: "EP: invalid delivered calendar date",
    field: "start",
    value: "2026-02-30",
  },
  { reason: "BVA: start after delivery", field: "start", value: "2026-11-21" },
  { reason: "EP: missing close date", field: "close", value: null },
  {
    reason: "EP: invalid close calendar date",
    field: "close",
    value: "2026-02-30T12:00:00Z",
  },
  { reason: "EP: invalid close date", field: "close", value: "not-a-date" },
])("$reason", async ({ field, value }) => {
  const items = acceptedFeatureItems()
  if (field === "start") {
    if (value) items[0].fieldValues.nodes[1].date = value
    else items[0].fieldValues.nodes.splice(1, 1)
    items[0].fieldValues.totalCount = items[0].fieldValues.nodes.length
  } else items[0].content!.closedAt = value
  const feature = await observe(items)
  expect(feature).toMatchObject({
    state: "Not available",
    startedAt: null,
    ageDays: null,
    leadTimeDays: null,
  })
  expect(feature.problems).toContainEqual(
    expect.objectContaining({
      number: 2,
      problem: expect.stringMatching(/date/i),
    }),
  )
})

it.each([
  {
    reason: "DT: closed empty Feature cannot create zero-day completion",
    empty: true,
    childReason: "COMPLETED",
    parentOpen: false,
  },
  {
    reason: "DT: not-planned child is not delivered",
    empty: false,
    childReason: "NOT_PLANNED",
    parentOpen: false,
  },
  {
    reason: "DT: missing child delivery reason cannot establish completion",
    empty: false,
    childReason: null,
    parentOpen: false,
  },
  {
    reason: "DT: Done board status does not accept an open parent",
    empty: false,
    childReason: "COMPLETED",
    parentOpen: true,
  },
])("$reason", async ({ empty, childReason, parentOpen }) => {
  const items = acceptedFeatureItems()
  if (empty)
    items[2].content!.subIssues = {
      totalCount: 0,
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }
  items[0].content!.stateReason = childReason
  if (parentOpen)
    Object.assign(items[2].content!, {
      state: "OPEN",
      stateReason: null,
      closedAt: null,
    })
  const feature = await observe(items)
  expect(feature.leadTimeDays).toBeNull()
  expect(feature.acceptedAt).toBeNull()
  expect(feature.state).not.toBe("Completed")
  if (!parentOpen) expect(feature.problems).not.toHaveLength(0)
})

it("reads a reopened required child on a later timeline page before publishing completion", async () => {
  const items = acceptedFeatureItems()
  items[1].content!.closedAt = "2026-11-24T12:00:00Z"
  items[1].content!.timelineItems!.pageInfo = {
    hasNextPage: true,
    endCursor: "child-history",
  }
  const dataset = await collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    fetch: async (_url, request) => {
      const { variables } = JSON.parse(request!.body as string)
      return new Response(
        JSON.stringify(
          variables.timelineAfter
            ? {
                data: {
                  node: {
                    timelineItems: {
                      nodes: [
                        {
                          __typename: "ReopenedEvent",
                          createdAt: "2026-11-24T09:00:00Z",
                        },
                        {
                          __typename: "ClosedEvent",
                          createdAt: "2026-11-24T12:00:00Z",
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                },
              }
            : featureBoardResponse(items),
        ),
      )
    },
  })
  expect(
    calculateFlowMetrics(dataset, dataset.observedAt).features[0],
  ).toMatchObject({
    state: "Reopened",
    leadTimeDays: null,
    startedAt: "2026-11-16",
    finishedAt: "2026-11-24",
  })
})

it.each([
  { reason: "EP: older reopened evidence lacks a timestamp", changes: [] },
  {
    reason: "EP: invalid retained reopen timestamp",
    changes: [{ state: "OPEN" as const, at: "unknown" }],
  },
])("$reason", ({ changes }) => {
  const dataset = normaliseBoard(acceptedFeatureItems(), ACCEPTANCE_OBSERVED_AT)
  dataset.items[0].reopened = true
  dataset.items[0].stateChanges = changes
  const feature = calculateFlowMetrics(dataset, dataset.observedAt).features[0]
  expect(feature).toMatchObject({
    state: "Reopened",
    leadTimeDays: null,
    startedAt: "2026-11-16",
    acceptedAt: null,
  })
  expect(feature.problems).toContainEqual(
    expect.objectContaining({
      number: 2,
      problem: expect.stringMatching(/Reopen date|reopen date/),
    }),
  )
})

it.each([
  {
    reason: "EP: reopened Ready child missing its original start",
    status: "Ready",
    start: null,
  },
  {
    reason: "EP: reopened Backlog child missing its original start",
    status: "Backlog",
    start: null,
  },
  {
    reason: "EP: reopened child with an invalid original start",
    status: "Ready",
    start: "2026-02-30",
  },
  {
    reason: "EP: reopened child preserves its valid original start",
    status: "Ready",
    start: "2026-11-16",
  },
])("$reason", async ({ status, start }) => {
  const items = acceptedFeatureItems()
  const child = items[0]
  child.fieldValues.nodes[0].name = status
  if (start) child.fieldValues.nodes[1].date = start
  else child.fieldValues.nodes.splice(1, 1)
  child.fieldValues.totalCount = child.fieldValues.nodes.length
  Object.assign(child.content!, {
    state: "OPEN",
    stateReason: null,
    closedAt: null,
  })
  child.content!.timelineItems!.nodes.push({
    __typename: "ReopenedEvent",
    createdAt: "2026-11-24T09:00:00Z",
  })
  const feature = await observe(items)
  const hasValidStart = start === "2026-11-16"
  expect(feature).toMatchObject({
    state: hasValidStart ? "Reopened" : "Not available",
    startedAt: hasValidStart ? start : null,
    ageDays: hasValidStart ? 9 : null,
    leadTimeDays: null,
  })
  expect(feature.children[0].timingState).toBe(
    hasValidStart ? "Available" : "Not available",
  )
  const missingStart = expect.objectContaining({
    number: 2,
    problem: "Missing or invalid Start date; Feature timing is not available",
  })
  if (hasValidStart) expect(feature.problems).not.toContainEqual(missingStart)
  else expect(feature.problems).toContainEqual(missingStart)
})

it.each([
  {
    reason: "EP: impossible reopen calendar date",
    reopenedAt: "2026-02-30T12:00:00Z",
  },
  { reason: "EP: reopen date without a timestamp", reopenedAt: "2026-11-01" },
])("$reason", async ({ reopenedAt }) => {
  const items = acceptedFeatureItems()
  items[0].content!.timelineItems!.nodes.push({
    __typename: "ReopenedEvent",
    createdAt: reopenedAt,
  })
  const feature = await observe(items)
  expect(feature).toMatchObject({
    state: "Reopened",
    startedAt: "2026-11-16",
    acceptedAt: null,
    leadTimeDays: null,
  })
  expect(feature.problems).toContainEqual(
    expect.objectContaining({
      number: 2,
      problem: "Invalid reopen date; renewed acceptance cannot be verified",
    }),
  )
})
