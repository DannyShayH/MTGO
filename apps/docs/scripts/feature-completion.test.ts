import { describe, expect, it } from "vitest"
import {
  collectBoard,
  normaliseBoard,
  type RawItem,
} from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  acceptedFeatureItems,
  ACCEPTANCE_OBSERVED_AT,
  featureBoardResponse,
  createFixtureFetch,
  buildChildEvidenceNode,
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

  it.each([
    { reason: "DT: removed abandoned work is not delivered", delivered: false },
    {
      reason: "DT: removed delivered work retains delivery history",
      delivered: true,
    },
  ])(
    "preserves the original start after removal: $reason",
    async ({ delivered }) => {
      const items = acceptedFeatureItems()
      const removed = items[0].content!
      Object.assign(removed, {
        stateReason: delivered ? "COMPLETED" : "NOT_PLANNED",
        closedAt: "2026-11-17T12:00:00Z",
      })
      items[2].content!.body =
        "Scope decision: #2 — removed — reason: duplicate discovery work"

      expect(await observe(items)).toMatchObject({
        state: "Completed",
        startedAt: "2026-11-16",
        finishedAt: "2026-11-20",
        leadTimeDays: 4,
        requiredCount: 1,
        deliveredCount: 1,
        removedChildren: [
          expect.objectContaining({
            number: 2,
            scope: "Removed",
            removalReason: "duplicate discovery work",
            delivered,
            closeReason: delivered ? "COMPLETED" : "NOT_PLANNED",
            startedAt: "2026-11-16",
          }),
        ],
        problems: [],
      })
    },
  )

  it.each([
    {
      reason: "EP: missing removal reason and unknown child",
      body: "Scope decision: #2 — removed\nScope decision: #999 — removed — reason: missing child",
      unknownChild: true,
    },
    {
      reason: "DT: two valid removal records for the same child",
      body: "Scope decision: #2 — removed — reason: duplicate work\nScope decision: #2 — removed — reason: superseded",
      unknownChild: false,
    },
    {
      reason: "DT: removal followed by a conflicting decision",
      body: "Scope decision: #2 — removed — reason: duplicate work\nScope decision: #2 — retained — reason: still required",
      unknownChild: false,
    },
    {
      reason: "DT: conflicting decision followed by removal",
      body: "Scope decision: #2 — retained — reason: still required\nScope decision: #2 — removed — reason: duplicate work",
      unknownChild: false,
    },
    {
      reason: "DT: valid removal and a second record missing its reason",
      body: "Scope decision: #2 — removed — reason: duplicate work\nScope decision: #2 — removed",
      unknownChild: false,
    },
  ])(
    "keeps ambiguous scope required: $reason",
    async ({ body, unknownChild }) => {
      const items = acceptedFeatureItems()
      items[2].content!.body = body
      const feature = await observe(items)
      expect(feature.requiredCount).toBe(2)
      expect(feature.removedChildren).toEqual([])
      expect(feature.problems).toContainEqual(
        expect.objectContaining({
          problem: expect.stringMatching(/ambiguous/i),
        }),
      )
      if (unknownChild)
        expect(feature.problems).toContainEqual(
          expect.objectContaining({
            problem: expect.stringMatching(/not a direct child/i),
          }),
        )
    },
  )

  it.each([
    {
      reason: "DT: delivered child missing Start",
      abandoned: false,
      missingStatus: false,
    },
    {
      reason: "DT: abandoned child with Done status missing Start",
      abandoned: true,
      missingStatus: false,
    },
    {
      reason: "DT: abandoned child with unknown status and Start",
      abandoned: true,
      missingStatus: true,
    },
  ])(
    "withholds timing for removed work: $reason",
    async ({ abandoned, missingStatus }) => {
      const items = acceptedFeatureItems()
      items[0].fieldValues.nodes = items[0].fieldValues.nodes.filter(
        (field) =>
          field.field?.name !== "Start date" &&
          (!missingStatus || field.field?.name !== "Status"),
      )
      if (abandoned) items[0].content!.stateReason = "NOT_PLANNED"
      items[0].fieldValues.totalCount = items[0].fieldValues.nodes.length
      items[2].content!.body =
        "Scope decision: #2 — removed — reason: missing historical evidence"

      const feature = await observe(items)
      expect(feature).toMatchObject({
        state: "Not available",
        startedAt: null,
        leadTimeDays: null,
      })
      expect(feature.problems).toContainEqual(
        expect.objectContaining({
          number: 2,
          problem: expect.stringMatching(/Start date/i),
        }),
      )
    },
  )
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

describe("archived Feature evidence", () => {
  it("archiving a completed Feature and its children keeps the reported interval", async () => {
    const items = acceptedFeatureItems()
    for (const item of items) item.isArchived = true
    const dataset = await collectBoard({
      token: "fixture-token",
      now: () => ACCEPTANCE_OBSERVED_AT,
      fetch: createFixtureFetch(items),
    })
    const metrics = calculateFlowMetrics(dataset, ACCEPTANCE_OBSERVED_AT)
    expect(metrics.features).toMatchObject([
      {
        number: 103,
        isArchived: true,
        state: "Completed",
        startedAt: "2026-11-16",
        finishedAt: "2026-11-20",
        leadTimeDays: 4,
        problems: [],
        children: [
          { number: 2, isArchived: true, delivered: true },
          { number: 3, isArchived: true, delivered: true },
        ],
      },
    ])
    expect(metrics).toMatchObject({
      throughput: [],
      cycleTime: [],
      wip: { count: 0 },
      dataProblems: [],
    })
  })
})

const buildEmptyProjectItemsPage = () => ({
  pageInfo: { hasNextPage: false, endCursor: null },
  nodes: [],
})

const collectWith = (fetchImpl: typeof fetch) =>
  collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    fetch: fetchImpl,
  })

describe("Feature children outside the board", () => {
  it.each([
    {
      reason: "EP: retrievable child keeps the delivery interval",
      readChild: (child: RawItem) => buildChildEvidenceNode(child),
      expected: {
        state: "Completed",
        leadTimeDays: 4,
        startedAt: "2026-11-16",
      },
      problem: null,
    },
    {
      reason: "EP: child that lost its Start date is identified",
      readChild: (child: RawItem) => {
        child.fieldValues.nodes = child.fieldValues.nodes.filter(
          (field) => field.field?.name !== "Start date",
        )
        child.fieldValues.totalCount = child.fieldValues.nodes.length
        return buildChildEvidenceNode(child)
      },
      expected: { state: "Not available", leadTimeDays: null, startedAt: null },
      problem: "Missing or invalid Start date; Feature timing is not available",
    },
    {
      reason: "EP: child on no project has no Status or Start date",
      readChild: (child: RawItem) => ({
        ...buildChildEvidenceNode(child),
        projectItems: buildEmptyProjectItemsPage(),
      }),
      expected: { state: "Not available", leadTimeDays: null, startedAt: null },
      problem:
        "Child is not on Project #2; its Status and Start date are not available",
    },
    {
      reason: "EP: child GitHub answers NOT_FOUND for stays visible",
      readChild: null,
      expected: { state: "Not available", leadTimeDays: null, startedAt: null },
      problem: "Child board evidence is not available",
    },
  ])("$reason", async ({ readChild, expected, problem }) => {
    const [discovery, child, parent] = acceptedFeatureItems()
    // Without evidence the fixture answers like GitHub: node null and NOT_FOUND
    const evidence = readChild ? { ISSUE_3: readChild(child) } : {}
    const dataset = await collectWith(
      createFixtureFetch([discovery, parent], evidence),
    )
    const metrics = calculateFlowMetrics(dataset, ACCEPTANCE_OBSERVED_AT)
    const feature = metrics.features[0]
    expect(feature).toMatchObject({ number: 103, ...expected })
    expect(feature.children.map((entry) => entry.number)).toEqual([2, 3])
    if (problem)
      expect(feature.problems).toContainEqual(
        expect.objectContaining({ number: 3, problem }),
      )
    else expect(feature.problems).toEqual([])
    // Only discovery is on the board, so only discovery is a work item
    expect(metrics.cycleTime.map((entry) => entry.number)).toEqual([2])
    expect(metrics.throughput.reduce((sum, week) => sum + week.count, 0)).toBe(
      1,
    )
    expect(metrics.wip.count).toBe(0)
    expect(metrics.dataProblems.map((entry) => entry.number)).not.toContain(3)
  })
})

describe("Feature evidence collection", () => {
  const notFound = {
    type: "NOT_FOUND",
    path: ["node"],
    message: "Could not resolve to a node with the global id of 'ISSUE_3'.",
  }

  // A lone NOT_FOUND on the node is a known missing fact ("Feature children
  // outside the board"); every other GraphQL answer stops collection
  it.each([
    {
      reason: "EP: any other GraphQL error on the child stops",
      answer: { errors: [{ message: "Something went wrong" }] },
    },
    {
      reason: "EP: NOT_FOUND together with another error stops",
      answer: {
        data: { node: null },
        errors: [notFound, { message: "Something went wrong" }],
      },
    },
    {
      reason: "EP: NOT_FOUND below the node, with a node returned, stops",
      answer: {
        data: { node: { __typename: "Issue" } },
        errors: [{ ...notFound, path: ["node", "projectItems"] }],
      },
    },
  ])("$reason", async ({ answer }) => {
    const [discovery, , parent] = acceptedFeatureItems()
    const board = createFixtureFetch([discovery, parent])
    const result = collectWith(async (url, init) => {
      const { variables } = JSON.parse(String(init?.body))
      if (variables.id === "ISSUE_3")
        return new Response(JSON.stringify(answer))
      return board(url, init)
    })
    await expect(result).rejects.toThrow(/GraphQL errors/)
  })

  type ProjectItemNode = ReturnType<
    typeof buildChildEvidenceNode
  >["projectItems"]["nodes"][number]
  const lastPage = { hasNextPage: false, endCursor: null }
  const repeatedPage = { hasNextPage: true, endCursor: "PROJECT_ITEMS_1" }

  it.each([
    {
      reason: "EP: complete second project-item page",
      secondPage: (projectItem: ProjectItemNode) => ({
        projectItems: { pageInfo: lastPage, nodes: [projectItem] },
      }),
      rejects: null,
    },
    {
      reason: "EP: unavailable second page stops",
      secondPage: () => null,
      rejects: /project item retrieval/,
    },
    {
      reason: "EP: non-advancing cursor stops",
      secondPage: (projectItem: ProjectItemNode) => ({
        projectItems: { pageInfo: repeatedPage, nodes: [projectItem] },
      }),
      rejects: /project item retrieval/,
    },
  ])("$reason", async ({ secondPage, rejects }) => {
    const [discovery, child, parent] = acceptedFeatureItems()
    const evidence = buildChildEvidenceNode(child)
    const projectItem = evidence.projectItems.nodes[0]
    // Another project's item fills the first page; Project #2 is on the second
    evidence.projectItems = {
      pageInfo: repeatedPage,
      nodes: [{ ...projectItem, id: "PVTI_OTHER", project: { url: "x" } }],
    }
    const board = createFixtureFetch([discovery, parent], { ISSUE_3: evidence })
    const result = collectWith(async (url, init) => {
      const { variables } = JSON.parse(String(init?.body))
      if (!variables.projectItemsAfter) return board(url, init)
      return new Response(
        JSON.stringify({ data: { node: secondPage(projectItem) } }),
      )
    })
    if (rejects) await expect(result).rejects.toThrow(rejects)
    else
      expect(
        calculateFlowMetrics(await result, ACCEPTANCE_OBSERVED_AT).features[0],
      ).toMatchObject({ state: "Completed", leadTimeDays: 4, problems: [] })
  })

  it.each([
    {
      reason:
        "DT R1: a withdrawn Feature's child outside the board is read (#64)",
      featureCloseReason: "NOT_PLANNED",
      childOnBoard: "no",
      isRead: true,
    },
    {
      reason: "DT R2: a child on the board is not read again",
      featureCloseReason: "COMPLETED",
      childOnBoard: "yes",
      isRead: false,
    },
    {
      reason: "DT R3: a child archived on the board is not read again",
      featureCloseReason: "COMPLETED",
      childOnBoard: "archived",
      isRead: false,
    },
    {
      reason: "DT R4: a reported Feature's child outside the board is read",
      featureCloseReason: "COMPLETED",
      childOnBoard: "no",
      isRead: true,
    },
  ])("$reason", async ({ featureCloseReason, childOnBoard, isRead }) => {
    const [discovery, child, parent] = acceptedFeatureItems()
    parent.content!.stateReason = featureCloseReason
    if (childOnBoard === "archived") child.isArchived = true
    const board = createFixtureFetch(
      childOnBoard === "no" ? [discovery, parent] : [discovery, child, parent],
      { ISSUE_3: buildChildEvidenceNode(child) },
    )
    const readIds: string[] = []
    const dataset = await collectWith(async (url, init) => {
      const { query, variables } = JSON.parse(String(init?.body))
      if (String(query).includes("projectItems")) readIds.push(variables.id)
      return board(url, init)
    })
    expect(readIds).toEqual(isRead ? ["ISSUE_3"] : [])
    // Stable identity: the child is in the dataset at most once
    expect(dataset.items.filter((issue) => issue.number === 3).length).toBe(
      childOnBoard === "no" && !isRead ? 0 : 1,
    )
  })
})

describe("archived items as Feature evidence", () => {
  it.each([
    {
      reason: "DT R1: a board item is kept",
      subject: "unrelated work",
      isArchived: false,
      isKept: true,
    },
    {
      reason: "DT R2: an archived Feature is kept",
      subject: "Feature",
      isArchived: true,
      isKept: true,
    },
    {
      reason: "DT R3: an archived child of a Feature is kept",
      subject: "Feature child",
      isArchived: true,
      isKept: true,
    },
    {
      reason: "DT R4: other archived work is dropped",
      subject: "unrelated work",
      isArchived: true,
      isKept: false,
    },
  ])("$reason", ({ subject, isArchived, isKept }) => {
    const [discovery, child, parent] = acceptedFeatureItems()
    const unrelatedWork = structuredClone(child)
    Object.assign(unrelatedWork, { id: "PVTI_50" })
    Object.assign(unrelatedWork.content!, {
      id: "ISSUE_50",
      number: 50,
      url: "https://github.com/DannyShayH/MTGO/issues/50",
    })
    const item =
      subject === "Feature"
        ? parent
        : subject === "Feature child"
          ? child
          : unrelatedWork
    item.isArchived = isArchived
    const dataset = normaliseBoard(
      [discovery, child, parent, unrelatedWork],
      ACCEPTANCE_OBSERVED_AT,
    )
    expect(dataset.items.some((issue) => issue.url === item.content!.url)).toBe(
      isKept,
    )
    // Kept archived items are evidence only, never work items
    const metrics = calculateFlowMetrics(dataset, ACCEPTANCE_OBSERVED_AT)
    expect(
      metrics.cycleTime.some((entry) => entry.number === item.content!.number),
    ).toBe(!isArchived && subject !== "Feature")
  })

  it("counts board and archived copies of one issue once, as board work", () => {
    const [discovery, child, parent] = acceptedFeatureItems()
    const archivedCopy = structuredClone(child)
    archivedCopy.isArchived = true
    const dataset = normaliseBoard(
      [archivedCopy, discovery, child, parent],
      ACCEPTANCE_OBSERVED_AT,
    )
    expect(dataset.items.map((issue) => issue.number)).toEqual([2, 3, 103])
    expect(dataset.items[1].evidenceOnly).toBeUndefined()
    const metrics = calculateFlowMetrics(dataset, ACCEPTANCE_OBSERVED_AT)
    expect(metrics.cycleTime.map((entry) => entry.number)).toEqual([2, 3])
    expect(metrics.features[0]).toMatchObject({ leadTimeDays: 4 })
  })
})
