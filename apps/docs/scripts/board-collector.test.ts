import { describe, expect, it } from "vitest"
import {
  collectBoard,
  normaliseBoard,
  type RawItem,
} from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  featureBoardItems,
  featureBoardResponse,
  FEATURE_OBSERVED_AT,
} from "./fixtures/feature-board.ts"
import recorded from "./fixtures/board-response.json"

const NOW = "2026-11-08T10:00:00Z"
const pages = recorded as {
  data: { user: { projectV2: { items: { nodes: RawItem[] } } } }
}[]
const recordedItems = pages.flatMap(
  (page) => page.data.user.projectV2.items.nodes,
)

const select = (field: string, name: string) => ({
  __typename: "ProjectV2ItemFieldSingleSelectValue",
  name,
  field: { name: field },
})
const status = (to: string, at: string, from = "") => ({
  __typename: "ProjectV2ItemStatusChangedEvent",
  createdAt: at,
  status: to,
  previousStatus: from,
})

const item = (
  number: number,
  overrides: Record<string, unknown> = {},
  fields: unknown[] = [select("Status", "Backlog")],
  timeline: unknown[] = [],
): RawItem =>
  ({
    id: `PVTI_${number}`,
    fieldValues: { totalCount: fields.length, nodes: fields },
    content: {
      __typename: "Issue",
      id: `ISSUE_${number}`,
      number,
      title: `Issue ${number}`,
      url: `https://github.com/DannyShayH/MTGO/issues/${number}`,
      state: "OPEN",
      stateReason: null,
      closedAt: null,
      labels: { totalCount: 0, nodes: [] },
      subIssues: { totalCount: 0 },
      timelineItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: timeline,
      },
      ...overrides,
    },
  }) as RawItem

describe("normaliseBoard", () => {
  it("retains close and reopen moments for historical WIP", () => {
    const dataset = normaliseBoard(
      [
        item(
          20,
          {},
          [],
          [
            { __typename: "ClosedEvent", createdAt: "2026-11-07T10:00:00Z" },
            { __typename: "ReopenedEvent", createdAt: "2026-11-07T11:00:00Z" },
          ],
        ),
      ],
      NOW,
    )
    expect(dataset.items[0].stateChanges).toEqual([
      { state: "CLOSED", at: "2026-11-07T10:00:00Z" },
      { state: "OPEN", at: "2026-11-07T11:00:00Z" },
    ])
  })

  it("maps a recorded response to the board dataset", () => {
    const dataset = normaliseBoard(recordedItems, NOW)
    expect(dataset.source).toBe("board")
    expect(dataset.observedAt).toBe(NOW)
    expect(dataset.items.map((i) => i.number)).toEqual([
      2, 3, 4, 5, 17, 18, 19, 20,
    ])
    expect(dataset.items.find((i) => i.number === 5)).toMatchObject({
      status: "Done",
      state: "CLOSED",
      closeReason: "COMPLETED",
      startedAt: "2026-11-07",
      workType: "development",
      blocked: false,
    })
  })

  it("sets workStartedAt from the first In Progress move on the Start date", () => {
    const [done] = normaliseBoard(
      [
        item(
          1,
          {
            state: "CLOSED",
            stateReason: "COMPLETED",
            closedAt: "2026-11-07T17:00:00Z",
          },
          [
            select("Status", "Done"),
            {
              __typename: "ProjectV2ItemFieldDateValue",
              date: "2026-11-07",
              field: { name: "Start date" },
            },
          ],
          [
            status("Backlog", "2026-11-06T10:00:00Z"),
            status("In Progress", "2026-11-07T09:00:00Z", "Ready"),
            status("In Progress", "2026-11-07T11:00:00Z", "Ready"),
          ],
        ),
      ],
      NOW,
    ).items
    expect(done.workStartedAt).toBe("2026-11-07T09:00:00Z")
  })

  it("leaves workStartedAt null when no start event is on the Start date", () => {
    const [i] = normaliseBoard(
      [
        item(
          1,
          {},
          [select("Status", "In Progress")],
          [status("In Progress", "2026-11-01T09:00:00Z")],
        ),
      ],
      NOW,
    ).items
    expect(i.workStartedAt).toBeNull()
    expect(i.startedAt).toBeNull()
  })

  it("accepts duplicate empty-to-Backlog events and still finds later changes", () => {
    const [i] = normaliseBoard(
      [
        item(
          1,
          {},
          [
            select("Status", "In Progress"),
            {
              __typename: "ProjectV2ItemFieldDateValue",
              date: "2026-11-08",
              field: { name: "Start date" },
            },
          ],
          [
            status("Backlog", "2026-11-07T16:00:00Z"),
            {
              ...status("Backlog", "2026-11-07T16:00:01Z"),
              previousStatus: null,
            },
            status("In Progress", "2026-11-08T08:00:00Z", "Backlog"),
          ],
        ),
      ],
      NOW,
    ).items
    expect(i.workStartedAt).toBe("2026-11-08T08:00:00Z")
    expect(i.statusChanges.map((c) => c.to)).toEqual(["Backlog", "In Progress"])
    const metrics = calculateFlowMetrics(
      { source: "board", observedAt: NOW, items: [i] },
      NOW,
    )
    expect(
      metrics.cumulativeFlow.map(({ date, counts }) => [
        date,
        counts.Backlog,
        counts["In Progress"],
      ]),
    ).toEqual([
      ["2026-11-07", 1, 0],
      ["2026-11-08", 0, 1],
    ])
  })

  it("keeps a later re-add to the board and drops only its duplicate", () => {
    const [i] = normaliseBoard(
      [
        item(
          1,
          {},
          [select("Status", "Backlog")],
          [
            status("Backlog", "2026-11-01T10:00:00Z"),
            status("Ready", "2026-11-02T10:00:00Z", "Backlog"),
            status("Backlog", "2026-11-05T10:00:00Z"),
            status("Backlog", "2026-11-05T10:00:01Z"),
          ],
        ),
      ],
      NOW,
    ).items
    expect(i.statusChanges).toEqual([
      { to: "Backlog", at: "2026-11-01T10:00:00Z" },
      { to: "Ready", at: "2026-11-02T10:00:00Z" },
      { to: "Backlog", at: "2026-11-05T10:00:00Z" },
    ])
  })

  it("keeps a closed issue without a reason and lists it as a data problem", () => {
    const dataset = normaliseBoard(
      [
        item(
          1,
          {
            state: "CLOSED",
            stateReason: null,
            closedAt: "2026-11-08T09:00:00Z",
          },
          [select("Status", "Done")],
        ),
      ],
      NOW,
    )
    expect(dataset.items[0].closeReason).toBeNull()
    expect(calculateFlowMetrics(dataset, NOW).dataProblems).toMatchObject([
      { number: 1, problem: "Closed without a reason" },
    ])
  })

  it("reads Priority and Size, and leaves them null when missing", () => {
    const [full, bare] = normaliseBoard(
      [
        item(1, {}, [select("Priority", "Must have"), select("Size", "M")]),
        item(2, {}, []),
      ],
      NOW,
    ).items
    expect(full).toMatchObject({ priority: "Must have", size: "M" })
    expect(bare).toMatchObject({ priority: null, size: null })
  })

  it("tolerates an issue without a label list", () => {
    const [i] = normaliseBoard([item(1, { labels: undefined })], NOW).items
    expect(i).toMatchObject({ workType: "unlabelled", blocked: false })
  })

  it("lists a completed issue without a start event as a data problem", () => {
    const dataset = normaliseBoard(
      [
        item(
          1,
          {
            state: "CLOSED",
            stateReason: "COMPLETED",
            closedAt: "2026-11-07T17:00:00Z",
          },
          [
            select("Status", "Done"),
            {
              __typename: "ProjectV2ItemFieldDateValue",
              date: "2026-11-07",
              field: { name: "Start date" },
            },
          ],
          [status("Backlog", "2026-11-06T10:00:00Z")],
        ),
      ],
      NOW,
    )
    const metrics = calculateFlowMetrics(dataset, NOW)
    expect(metrics.dataProblems.map((p) => p.problem)).toEqual([
      "Missing start time",
    ])
  })

  it("marks reopened issues, blocked label and work type", () => {
    const [i] = normaliseBoard(
      [
        item(
          1,
          {
            state: "CLOSED",
            stateReason: "COMPLETED",
            closedAt: "2026-11-08T09:00:00Z",
            labels: {
              totalCount: 2,
              nodes: [{ name: "blocked" }, { name: "rework" }],
            },
          },
          [select("Status", "Done")],
          [
            { __typename: "ClosedEvent", createdAt: "2026-11-07T09:00:00Z" },
            { __typename: "ReopenedEvent", createdAt: "2026-11-07T10:00:00Z" },
            { __typename: "ClosedEvent", createdAt: "2026-11-08T09:00:00Z" },
          ],
        ),
      ],
      NOW,
    ).items
    expect(i).toMatchObject({
      reopened: true,
      blocked: true,
      workType: "rework",
    })
  })

  it("treats duplicates as closed without delivery and counts sub-issues", () => {
    const [i] = normaliseBoard(
      [
        item(1, {
          state: "CLOSED",
          stateReason: "DUPLICATE",
          closedAt: "2026-11-08T09:00:00Z",
          subIssues: { totalCount: 2 },
        }),
      ],
      NOW,
    ).items
    expect(i).toMatchObject({ closeReason: "NOT_PLANNED", subIssueCount: 2 })
  })

  it("uses unlabelled and a placeholder status when those are missing", () => {
    const [i] = normaliseBoard([item(1, {}, [])], NOW).items
    expect(i).toMatchObject({
      workType: "unlabelled",
      status: "No Status",
      startedAt: null,
    })
  })

  it("lists an open issue without a Status as a data problem", () => {
    const dataset = normaliseBoard([item(1, {}, []), item(2)], NOW)
    expect(calculateFlowMetrics(dataset, NOW).dataProblems).toEqual([
      expect.objectContaining({ number: 1, problem: "Missing status" }),
    ])
  })

  it("skips draft issues and pull requests", () => {
    const draft = {
      id: "PVTI_d",
      fieldValues: { nodes: [] },
      content: { __typename: "DraftIssue" },
    } as unknown as RawItem
    const dataset = normaliseBoard([draft, item(1)], NOW)
    expect(dataset.items.map((i) => i.number)).toEqual([1])
  })

  it("throws for an empty dataset", () => {
    expect(() => normaliseBoard([], NOW)).toThrow(/no issues/i)
  })

  it.each([
    ["a missing title", { title: undefined }, /#1.*title/],
    ["an unknown state", { state: "MERGED" }, /#1.*state/],
    [
      "a closed issue without a close date",
      { state: "CLOSED", stateReason: "COMPLETED", closedAt: null },
      /#1.*close date/,
    ],
  ])("throws a validation error for %s", (_name, overrides, message) => {
    expect(() => normaliseBoard([item(1, overrides)], NOW)).toThrow(message)
  })

  it.each([
    [
      "labels",
      item(1, { labels: { totalCount: 101, nodes: [{ name: "blocked" }] } }),
    ],
    [
      "project fields",
      {
        ...item(1),
        fieldValues: {
          totalCount: 101,
          nodes: [select("Status", "Backlog")],
        },
      } as RawItem,
    ],
  ])(
    "throws instead of silently dropping %s past the first page",
    (name, raw) => {
      expect(() => normaliseBoard([raw], NOW)).toThrow(
        new RegExp(`#1.*more ${name}`),
      )
    },
  )

  it("throws when GitHub leaves out the label count, as it cannot tell what is missing", () => {
    expect(() =>
      normaliseBoard(
        [item(1, { labels: { nodes: [{ name: "blocked" }] } })],
        NOW,
      ),
    ).toThrow(/#1.*labels.*totalCount/)
  })

  it("throws for a malformed Start date", () => {
    expect(() =>
      normaliseBoard(
        [
          item(1, {}, [
            {
              __typename: "ProjectV2ItemFieldDateValue",
              date: "soon",
              field: { name: "Start date" },
            },
          ]),
        ],
        NOW,
      ),
    ).toThrow(/#1.*Start date/)
  })
})

describe("collectBoard", () => {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

  it.each([
    {
      scenario: "features" as const,
      reason: "DT: empty and populated Features plus ordinary parent",
    },
    {
      scenario: "completed-feature" as const,
      reason: "DT: completing an empty Feature changes no work-item values",
    },
  ])("$reason", async ({ scenario }) => {
    const collect = (items: RawItem[]) =>
      collectBoard({
        token: "fixture-token",
        now: () => FEATURE_OBSERVED_AT,
        fetch: () => json(featureBoardResponse(items)),
      })
    const baseline = await collect(featureBoardItems("work"))
    const dataset = await collect(featureBoardItems(scenario))
    expect(dataset.items.find((issue) => issue.number === 100)).toMatchObject({
      title: "Feature: Empty capability",
      subIssueCount: 0,
    })
    expect(dataset.items.find((issue) => issue.number === 104)).toMatchObject({
      title: "Ordinary structural parent",
      subIssueCount: 1,
    })
    const metrics = calculateFlowMetrics(dataset, dataset.observedAt)
    expect({ ...metrics, features: [] }).toEqual(
      calculateFlowMetrics(baseline, baseline.observedAt),
    )
    expect(metrics).toMatchObject({
      source: "board",
      observedAt: FEATURE_OBSERVED_AT,
      wip: { count: 1 },
      ready: { count: 1 },
      throughput: [{ count: 1 }],
      cycleTime: [{ number: 3, days: 1 }],
    })
    const extra = await collect(featureBoardItems("extra-work"))
    expect(calculateFlowMetrics(extra, extra.observedAt).wip.count).toBe(2)
  })

  it("follows pagination and sends the token", async () => {
    const calls: { auth: string | null; variables: Record<string, unknown> }[] =
      []
    const fetchPages: typeof fetch = (_url, init) => {
      const body = JSON.parse(String(init?.body))
      calls.push({
        auth: new Headers(init?.headers).get("authorization"),
        variables: body.variables,
      })
      return json(
        pages[calls.length - 1]
          ? withCursor(pages[calls.length - 1], calls.length === 1)
          : null,
      )
    }
    const dataset = await collectBoard({
      token: "secret-token",
      fetch: fetchPages,
      now: () => NOW,
    })
    expect(calls).toHaveLength(2)
    expect(calls[0].auth).toBe("Bearer secret-token")
    expect(calls[0].variables.after).toBeNull()
    expect(calls[1].variables.after).toBe("CURSOR_1")
    expect(dataset.items).toHaveLength(8)
  })

  it("fetches the remaining timeline of an issue with more than one page", async () => {
    const first = item(
      1,
      {},
      [select("Status", "Backlog")],
      [status("Backlog", "2026-11-01T00:00:00Z")],
    )
    ;(first.content as any).timelineItems.pageInfo = {
      hasNextPage: true,
      endCursor: "T1",
    }
    const requests: Record<string, unknown>[] = []
    const f: typeof fetch = (_url, init) => {
      const body = JSON.parse(String(init?.body))
      requests.push(body.variables)
      if (body.variables.id)
        return json({
          data: {
            node: {
              timelineItems: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [status("Ready", "2026-11-02T00:00:00Z", "Backlog")],
              },
            },
          },
        })
      return json({
        data: {
          user: {
            projectV2: {
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [first],
              },
            },
          },
        },
      })
    }
    const dataset = await collectBoard({
      token: "ghp_testtoken",
      fetch: f,
      now: () => NOW,
    })
    expect(requests[1]).toMatchObject({ id: "ISSUE_1", timelineAfter: "T1" })
    expect(dataset.items).toHaveLength(1)
  })

  it("throws on 401 naming the expired token without leaking it", async () => {
    const f: typeof fetch = () => json({ message: "Bad credentials" }, 401)
    const error = await collectBoard({
      token: "secret-token",
      fetch: f,
      now: () => NOW,
    }).catch((e) => e)
    expect(error.message).toMatch(/PROJECT_READER.*expired/)
    expect(error.message).not.toContain("secret-token")
  })

  it.each([
    ["a server error", () => json({}, 502), /502/],
    [
      "GraphQL errors",
      () => json({ errors: [{ message: "Something broke" }] }),
      /Something broke/,
    ],
    [
      "a missing project",
      () => json({ data: { user: { projectV2: null } } }),
      /Project #2/,
    ],
  ])("throws explicitly for %s", async (_name, respond, message) => {
    await expect(
      collectBoard({
        token: "ghp_testtoken",
        fetch: (() => respond()) as typeof fetch,
        now: () => NOW,
      }),
    ).rejects.toThrow(message)
  })

  it("throws explicitly when the network fails", async () => {
    const f: typeof fetch = () => Promise.reject(new Error("socket hang up"))
    await expect(
      collectBoard({ token: "ghp_testtoken", fetch: f, now: () => NOW }),
    ).rejects.toThrow(/socket hang up/)
  })
})

function withCursor(page: (typeof pages)[number], hasNext: boolean) {
  const copy = structuredClone(page)
  copy.data.user.projectV2.items = {
    ...copy.data.user.projectV2.items,
    pageInfo: { hasNextPage: hasNext, endCursor: hasNext ? "CURSOR_1" : null },
  } as never
  return copy
}

describe("ongoing Feature reporting", () => {
  it("connects discovery and required work without inflating work-item flow", async () => {
    const items = featureBoardItems("work")
    const parent = item(42, {
      title: "Feature: Reporting",
      subIssues: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: items
          .filter((raw) => raw.content?.number !== 1)
          .map((raw) => raw.content),
      },
    })
    const dataset = await collectBoard({
      token: "fixture-token",
      now: () => FEATURE_OBSERVED_AT,
      fetch: async () =>
        new Response(JSON.stringify(featureBoardResponse([...items, parent]))),
    })
    const metrics = calculateFlowMetrics(dataset, dataset.observedAt)
    expect(metrics.features).toMatchObject([
      {
        number: 42,
        state: "Ongoing",
        requiredCount: 2,
        deliveredCount: 1,
        startedAt: "2026-11-10",
        ageDays: 2,
        problems: [],
        children: [
          { number: 2, status: "Ready" },
          { number: 3, cycleDays: 1 },
        ],
      },
    ])
    expect(metrics.wip.count).toBe(1)
    expect(metrics.cycleTime).toHaveLength(1)
  })
})

describe("Feature evidence boundaries", () => {
  it.each([
    {
      reason: "EP: unstarted child can lack Start date",
      status: "Ready",
      start: null,
      expectedState: "Not started",
      expectedAge: null,
    },
    {
      reason: "DT: started child cannot lack Start date",
      status: "In Progress",
      start: null,
      expectedState: "Not available",
      expectedAge: null,
    },
    {
      reason: "EP: invalid calendar date",
      status: "In Progress",
      start: "2026-02-30",
      expectedState: "Not available",
      expectedAge: null,
    },
    {
      reason: "BVA: future date",
      status: "In Progress",
      start: "2026-11-14",
      expectedState: "Not available",
      expectedAge: null,
    },
    {
      reason: "BVA: same Copenhagen day",
      status: "In Progress",
      start: "2026-11-13",
      expectedState: "Ongoing",
      expectedAge: 0,
    },
    {
      reason: "BVA: Copenhagen midnight before UTC midnight",
      status: "In Progress",
      start: "2026-11-12",
      expectedState: "Ongoing",
      expectedAge: 1,
    },
    {
      reason: "BVA: across daylight saving",
      status: "In Progress",
      start: "2026-10-24",
      expectedState: "Ongoing",
      expectedAge: 20,
    },
  ])(
    "$reason",
    ({ status: childStatus, start, expectedState, expectedAge }) => {
      const child = item(1, {}, [
        select("Status", childStatus),
        ...(start
          ? [
              {
                __typename: "ProjectV2ItemFieldDateValue",
                date: start,
                field: { name: "Start date" },
              },
            ]
          : []),
      ])
      const parent = item(42, {
        title: "Feature: Timing",
        subIssues: { totalCount: 1, nodes: [child.content] },
      })
      const metrics = calculateFlowMetrics(
        normaliseBoard([parent, child], "2026-11-12T23:30:00Z"),
        "2026-11-12T23:30:00Z",
      )
      expect(metrics.features[0]).toMatchObject({
        state: expectedState,
        ageDays: expectedAge,
      })
      expect(metrics.features[0].problems.length).toBe(
        expectedState === "Not available" ? 1 : 0,
      )
    },
  )

  it("does not substitute a sibling date for a delivered child's missing start", () => {
    const items = featureBoardItems("ongoing")
    const delivered = items.find((raw) => raw.content?.number === 3)!
    delivered.fieldValues.nodes = delivered.fieldValues.nodes.filter(
      (field) => field.field?.name !== "Start date",
    )
    delivered.fieldValues.totalCount = delivered.fieldValues.nodes.length
    const feature = calculateFlowMetrics(
      normaliseBoard(items, FEATURE_OBSERVED_AT),
      FEATURE_OBSERVED_AT,
    ).features.find((entry) => entry.number === 101)!
    expect(feature).toMatchObject({
      startedAt: null,
      ageDays: null,
      deliveredCount: 1,
      problems: [{ number: 3 }],
    })
  })

  it.each([
    { reason: "EP: complete second child page", broken: false },
    {
      reason: "EP: unavailable second child page fails collection",
      broken: true,
    },
  ])("$reason", async ({ broken }) => {
    const children = featureBoardItems("work")
    const parent = item(42, {
      title: "Feature: Paged",
      subIssues: {
        totalCount: 2,
        nodes: [children[1].content],
        pageInfo: { hasNextPage: true, endCursor: "CHILD_1" },
      },
    })
    const result = collectBoard({
      token: "fixture-token",
      now: () => FEATURE_OBSERVED_AT,
      fetch: async (_url, init) => {
        const { variables } = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify(
            variables.childrenAfter
              ? {
                  data: {
                    node: broken
                      ? null
                      : {
                          subIssues: {
                            totalCount: 2,
                            nodes: [children[2].content],
                            pageInfo: { hasNextPage: false, endCursor: null },
                          },
                        },
                  },
                }
              : featureBoardResponse([...children, parent]),
          ),
        )
      },
    })
    if (broken) await expect(result).rejects.toThrow(/child page/)
    else {
      const dataset = await result
      expect(
        calculateFlowMetrics(dataset, dataset.observedAt).features[0],
      ).toMatchObject({ requiredCount: 2, deliveredCount: 1, ageDays: 2 })
    }
  })

  it.each([
    { reason: "DT: nested child on the board", onBoard: true, nested: true },
    {
      reason: "DT: nested child outside the board",
      onBoard: false,
      nested: true,
    },
    {
      reason: "DT: leaf child outside the board",
      onBoard: false,
      nested: false,
    },
  ])("$reason", ({ onBoard, nested }) => {
    const child = item(1, {
      subIssues: { totalCount: nested ? 1 : 0 },
      state: "CLOSED",
      stateReason: "COMPLETED",
      closedAt: "2026-11-11T12:00:00Z",
    })
    const parent = item(42, {
      title: "Feature: Nested",
      subIssues: { totalCount: 1, nodes: [child.content] },
    })
    const metrics = calculateFlowMetrics(
      normaliseBoard(onBoard ? [parent, child] : [parent], FEATURE_OBSERVED_AT),
      FEATURE_OBSERVED_AT,
    )
    const feature = metrics.features[0]
    expect(feature).toMatchObject({ deliveredCount: null, ageDays: null })
    expect(feature.problems).toEqual(
      [
        ...(nested
          ? [
              {
                number: 1,
                problem: expect.stringContaining("Unsupported nesting"),
              },
            ]
          : []),
        ...(!onBoard
          ? [{ number: 1, problem: "Child board evidence is not available" }]
          : []),
      ].map((problem) => expect.objectContaining(problem)),
    )
    expect(metrics.throughput).toEqual([])
  })

  it.each([
    {
      reason: "DT: never-started work closed as not planned",
      history: [],
      expectedAge: 2,
    },
    {
      reason: "DT: previously started work closed as not planned",
      history: [status("In Progress", "2026-11-10T09:00:00Z")],
      expectedAge: null,
    },
    {
      reason: "DT: previous Done status establishes started work",
      history: [status("Done", "2026-11-10T09:00:00Z")],
      expectedAge: null,
    },
  ])("$reason", ({ history, expectedAge }) => {
    const items = featureBoardItems("ongoing")
    const abandoned = items.find((raw) => raw.content?.number === 2)!
    abandoned.content!.state = "CLOSED"
    abandoned.content!.stateReason = "NOT_PLANNED"
    abandoned.content!.closedAt = "2026-11-11T12:00:00Z"
    abandoned.content!.timelineItems!.nodes = history
    const feature = calculateFlowMetrics(
      normaliseBoard(items, FEATURE_OBSERVED_AT),
      FEATURE_OBSERVED_AT,
    ).features.find((entry) => entry.number === 101)!
    expect(feature).toMatchObject({
      state: expectedAge === null ? "Not available" : "Ongoing",
      startedAt: expectedAge === null ? null : "2026-11-10",
      ageDays: expectedAge,
      requiredCount: 3,
      deliveredCount: 1,
    })
    expect(feature.problems).toEqual(
      expectedAge === null
        ? [
            expect.objectContaining({
              number: 2,
              problem: expect.stringContaining("Start date"),
            }),
          ]
        : [],
    )
  })

  it.each([
    {
      reason: "EP: confirmed completed delivery",
      closeReason: "COMPLETED",
      expectedCount: 1,
    },
    {
      reason: "EP: confirmed closure without delivery",
      closeReason: "NOT_PLANNED",
      expectedCount: 0,
    },
    {
      reason: "EP: unknown closed-child outcome",
      closeReason: null,
      expectedCount: null,
    },
  ])("$reason", async ({ closeReason, expectedCount }) => {
    const items = featureBoardItems("ongoing")
    items.find((raw) => raw.content?.number === 3)!.content!.stateReason =
      closeReason
    const dataset = await collectBoard({
      token: "fixture-token",
      now: () => FEATURE_OBSERVED_AT,
      fetch: async () =>
        new Response(JSON.stringify(featureBoardResponse(items))),
    })
    const metrics = calculateFlowMetrics(dataset, dataset.observedAt)
    const feature = metrics.features.find((entry) => entry.number === 101)!
    expect(feature).toMatchObject({
      state: "Ongoing",
      startedAt: "2026-11-10",
      ageDays: 2,
      requiredCount: 3,
      deliveredCount: expectedCount,
    })
    expect(
      feature.children.find((child) => child.number === 3)!.delivered,
    ).toBe(closeReason === "COMPLETED")
    expect(feature.problems).toEqual(
      closeReason === null
        ? [
            expect.objectContaining({
              number: 3,
              url: "https://github.com/DannyShayH/MTGO/issues/3",
              problem:
                "Closed without a reason; delivery count is not available",
            }),
          ]
        : [],
    )
    expect(
      metrics.throughput.reduce((total, week) => total + week.count, 0),
    ).toBe(closeReason === "COMPLETED" ? 1 : 0)
  })
})

describe("incomplete direct-child retrieval", () => {
  it.each([
    { reason: "EP: omitted relationship connection", connection: undefined },
    {
      reason: "EP: count without child evidence",
      connection: { totalCount: 1 },
    },
    {
      reason: "BVA: terminal page shorter than totalCount",
      connection: {
        totalCount: 1,
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
    {
      reason: "BVA: next page has no usable cursor",
      connection: {
        totalCount: 1,
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
    },
  ])("$reason", async ({ connection }) => {
    await expect(
      collectBoard({
        token: "fixture-token",
        now: () => FEATURE_OBSERVED_AT,
        fetch: async () =>
          new Response(
            JSON.stringify(
              featureBoardResponse([
                item(42, {
                  title: "Feature: Incomplete",
                  subIssues: connection,
                }),
              ]),
            ),
          ),
      }),
    ).rejects.toThrow(/child.*incomplete/)
  })
})

it("withholds delivered counts when a required child's delivery evidence is unavailable", () => {
  const metrics = calculateFlowMetrics(
    normaliseBoard(featureBoardItems("ongoing"), FEATURE_OBSERVED_AT),
    FEATURE_OBSERVED_AT,
  )
  expect(
    metrics.features.find((feature) => feature.number === 102),
  ).toMatchObject({ requiredCount: 1, deliveredCount: null, ageDays: null })
})
