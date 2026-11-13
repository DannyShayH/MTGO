import { describe, expect, it } from "vitest"
import { collectBoard } from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  ACCEPTANCE_OBSERVED_AT,
  buildChildEvidenceNode,
  createFixtureFetch,
  featureBoardResponse,
  membershipEvent,
  movedFeatureItems,
  movedOnFeatureItems,
  reattachedFeatureItems,
  splitTimeline,
  unlinkedFeatureItems,
} from "./fixtures/feature-board.ts"

async function observe(
  items = movedFeatureItems(),
  evidence: Record<string, unknown> = {},
  fetchImpl: typeof fetch = createFixtureFetch(items, evidence),
) {
  const dataset = await collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    fetch: fetchImpl,
  })
  const metrics = calculateFlowMetrics(dataset, ACCEPTANCE_OBSERVED_AT)
  const feature = (number: number) =>
    metrics.features.find((entry) => entry.number === number)!
  return { metrics, feature }
}

describe("moved and late-linked Feature work", () => {
  it("keeps the former Feature's start, uses the actual start in the receiving Feature and counts the work item once", async () => {
    const { metrics, feature } = await observe()
    expect(feature(103)).toMatchObject({
      state: "Completed",
      startedAt: "2026-11-16",
      finishedAt: "2026-11-20",
      leadTimeDays: 4,
      requiredCount: 1,
      deliveredCount: 1,
      problems: [],
      removedChildren: [
        expect.objectContaining({
          number: 2,
          scope: "Moved",
          leftAt: "2026-11-19T10:00:00Z",
          movedTo: expect.objectContaining({ number: 105 }),
          removalReason: "moved to the receiving capability",
          startedAt: "2026-11-16",
        }),
      ],
    })
    expect(feature(105)).toMatchObject({
      state: "Completed",
      startedAt: "2026-11-16",
      finishedAt: "2026-11-20",
      leadTimeDays: 4,
      requiredCount: 1,
      problems: [],
    })
    expect(metrics.cycleTime.map((entry) => entry.number)).toEqual([2, 3])
    expect(metrics.throughput.reduce((sum, week) => sum + week.count, 0)).toBe(
      2,
    )
  })
})

describe("unlinked, reattached and late-starting work", () => {
  it.each([
    {
      reason:
        "DT: unlinking the earliest child keeps the original start and shows the reason",
      items: () => unlinkedFeatureItems(),
      expected: {
        state: "Completed",
        startedAt: "2026-11-16",
        leadTimeDays: 4,
        problems: [],
        removedChildren: [
          expect.objectContaining({
            number: 2,
            scope: "Unlinked",
            movedTo: null,
            removalReason: "discovery handled outside Features",
          }),
        ],
      },
      workItems: [2, 3],
    },
    {
      reason:
        "DT: an archived unlinked child still supplies its project Start date",
      items: () => {
        const items = unlinkedFeatureItems()
        items[0].isArchived = true
        return items
      },
      expected: {
        startedAt: "2026-11-16",
        leadTimeDays: 4,
        removedChildren: [
          expect.objectContaining({ number: 2, isArchived: true }),
        ],
      },
      // Archived evidence is not a work item
      workItems: [3],
    },
    {
      reason:
        "DT: a child reattached after removal is required current work again",
      items: () => reattachedFeatureItems(),
      expected: {
        state: "Completed",
        startedAt: "2026-11-16",
        leadTimeDays: 4,
        requiredCount: 2,
        deliveredCount: 2,
        removedChildren: [],
        problems: [],
      },
      workItems: [2, 3],
    },
    {
      reason:
        "DT: a former child that started only after leaving supplies no start",
      items: () => {
        const [unlinked, remaining, former] = unlinkedFeatureItems()
        unlinked.fieldValues.nodes[1].date = "2026-11-19"
        unlinked.content!.timelineItems!.nodes[0].createdAt =
          "2026-11-21T09:00:00Z"
        unlinked.content!.closedAt = "2026-11-21T09:00:00Z"
        // Leaves on 18 November, starts 19 November; #3 starts 19 November too
        former.content!.timelineItems!.nodes[2].createdAt =
          "2026-11-18T10:00:00Z"
        return [unlinked, remaining, former]
      },
      expected: {
        state: "Completed",
        startedAt: "2026-11-19",
        leadTimeDays: 1,
        removedChildren: [
          expect.objectContaining({
            number: 2,
            timingState: "Started after leaving",
          }),
        ],
      },
      workItems: [3, 2],
    },
    {
      reason:
        "BVA: a former child that started on the day it left still supplies its start",
      items: () => {
        const [unlinked, remaining, former] = unlinkedFeatureItems()
        unlinked.fieldValues.nodes[1].date = "2026-11-19"
        unlinked.content!.timelineItems!.nodes[0].createdAt =
          "2026-11-21T09:00:00Z"
        unlinked.content!.closedAt = "2026-11-21T09:00:00Z"
        // Leaves 19 November at 10:00 and starts the same day
        return [unlinked, remaining, former]
      },
      expected: {
        startedAt: "2026-11-19",
        removedChildren: [
          expect.objectContaining({
            number: 2,
            startedAt: "2026-11-19",
            timingState: "Available",
          }),
        ],
      },
      workItems: [3, 2],
    },
    {
      reason:
        "DT: a child moved on to a further Feature still shows where it first moved",
      items: () => movedOnFeatureItems("further"),
      expected: {
        startedAt: "2026-11-16",
        removedChildren: [
          expect.objectContaining({
            number: 2,
            scope: "Moved",
            movedTo: expect.objectContaining({ number: 105 }),
          }),
        ],
      },
      workItems: [2, 3],
    },
    {
      reason: "DT: a child unlinked after moving still shows where it moved",
      items: () => movedOnFeatureItems("none"),
      expected: {
        startedAt: "2026-11-16",
        removedChildren: [
          expect.objectContaining({
            number: 2,
            scope: "Moved",
            movedTo: expect.objectContaining({ number: 105 }),
          }),
        ],
      },
      workItems: [2, 3],
    },
  ])("$reason", async ({ items, expected, workItems }) => {
    const { metrics, feature } = await observe(items())
    expect(feature(103)).toMatchObject(expected)
    expect(metrics.cycleTime.map((entry) => entry.number)).toEqual(workItems)
  })
})

describe("missing historical membership evidence", () => {
  it.each([
    {
      reason: "EP: removal event whose child GitHub cannot show",
      change: (items: ReturnType<typeof movedFeatureItems>) => {
        items[2].content!.timelineItems!.nodes[2] = membershipEvent(
          "removed",
          "2026-11-19T10:00:00Z",
          null,
        )
      },
      number: 103,
      problem: /removed on 2026-11-19 cannot be identified/,
    },
    {
      reason: "EP: former child GitHub answers NOT_FOUND for",
      change: (items: ReturnType<typeof movedFeatureItems>) => {
        items.splice(0, 1)
        items[2].content!.subIssues = {
          totalCount: 0,
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        }
      },
      number: 2,
      problem: /Former child evidence is not available/,
    },
    {
      reason: "EP: started former child that lost its Start date",
      change: (items: ReturnType<typeof movedFeatureItems>) => {
        items[0].fieldValues.nodes.splice(1, 1)
        items[0].fieldValues.totalCount = 1
      },
      number: 2,
      problem: /Missing or invalid Start date/,
    },
  ])(
    "$reason makes timing unavailable",
    async ({ change, number, problem }) => {
      const items = movedFeatureItems()
      change(items)
      const { feature } = await observe(items)
      // No remaining sibling date replaces the lost start
      expect(feature(103)).toMatchObject({
        state: "Not available",
        startedAt: null,
        leadTimeDays: null,
      })
      expect(feature(103).problems).toContainEqual(
        expect.objectContaining({
          number,
          problem: expect.stringMatching(problem),
        }),
      )
    },
  )

  it("EP: a former child without a scope record keeps timing but asks for the reason", async () => {
    const items = movedFeatureItems()
    items[2].content!.body = null
    const { feature } = await observe(items)
    expect(feature(103)).toMatchObject({
      state: "Completed",
      startedAt: "2026-11-16",
      leadTimeDays: 4,
      problems: [
        expect.objectContaining({
          number: 2,
          problem: expect.stringMatching(/without a Scope decision record/),
        }),
      ],
    })
  })
})

describe("membership history collection", () => {
  it("reads a removal on a later Feature timeline page and an unlinked former child outside the board", async () => {
    const items = unlinkedFeatureItems()
    const [moved, , former] = items
    // The removal and every later event sit on the second timeline page
    const laterPages = splitTimeline(former, 2, "membership-history")
    const { metrics, feature } = await observe(
      items,
      {},
      createFixtureFetch(
        items.slice(1),
        { ISSUE_2: buildChildEvidenceNode(moved) },
        laterPages,
      ),
    )
    expect(feature(103)).toMatchObject({
      state: "Completed",
      startedAt: "2026-11-16",
      leadTimeDays: 4,
      removedChildren: [
        expect.objectContaining({ number: 2, scope: "Unlinked" }),
      ],
    })
    // Off-board evidence never becomes a work item
    expect(metrics.cycleTime.map((entry) => entry.number)).toEqual([3])
  })

  it.each([
    {
      reason: "EP: membership page that cannot be read stops",
      answer: { data: { node: null } },
    },
    {
      reason: "EP: removal event without a time stops",
      answer: {
        data: {
          node: {
            timelineItems: {
              nodes: [{ __typename: "SubIssueRemovedEvent", subIssue: null }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    },
  ])("$reason before publication", async ({ answer }) => {
    const items = movedFeatureItems()
    items[2].content!.timelineItems!.pageInfo = {
      hasNextPage: true,
      endCursor: "membership-history",
    }
    const result = observe(items, {}, async (_url, init) => {
      const { variables } = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify(
          variables.timelineAfter ? answer : featureBoardResponse(items),
        ),
      )
    })
    await expect(result).rejects.toThrow(/Timeline|history/)
  })
})
