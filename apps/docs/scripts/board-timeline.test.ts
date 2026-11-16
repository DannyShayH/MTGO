import { describe, expect, it } from "vitest"
import { collectBoard } from "./board-collector.ts"
import { calculateFlowMetrics } from "./flow-metrics.ts"
import {
  createFixtureFetch,
  featureBoardItems,
  FEATURE_OBSERVED_AT,
} from "./fixtures/feature-board.ts"

describe("authoritative issue timelines", () => {
  it("recovers a start event absent from a supposedly complete project timeline", async () => {
    const items = featureBoardItems("work")
    const completed = items.find((item) => item.content?.number === 3)!
    const direct = structuredClone(completed.content!.timelineItems!)
    completed.content!.timelineItems!.nodes = []
    const fixture = createFixtureFetch(items)
    const dataset = await collectBoard({
      token: "fixture-token",
      now: () => FEATURE_OBSERVED_AT,
      fetch: async (url, init) => {
        const { variables } = JSON.parse(String(init?.body))
        if (variables.id === completed.content!.id)
          return new Response(
            JSON.stringify({ data: { node: { timelineItems: direct } } }),
          )
        return fixture(url, init)
      },
    })
    const result = dataset.items.find((item) => item.number === 3)!
    expect(result.workStartedAt).toBe("2026-11-10T09:00:00Z")
    expect(result.stateChanges).toEqual([
      { state: "CLOSED", at: "2026-11-11T12:00:00Z" },
    ])
    expect(
      calculateFlowMetrics(dataset, FEATURE_OBSERVED_AT).dataProblems.filter(
        (problem) => problem.number === 3,
      ),
    ).toEqual([])
  })

  it.each([
    {
      reason: "EP: issue cannot be read",
      node: null,
    },
    {
      reason: "EP: missing timeline",
      node: {},
    },
    {
      reason: "EP: missing page metadata",
      node: { timelineItems: { nodes: [] } },
    },
    {
      reason: "EP: missing event list",
      node: {
        timelineItems: { pageInfo: { hasNextPage: false, endCursor: null } },
      },
    },
    {
      reason: "EP: invalid continuation flag",
      node: {
        timelineItems: {
          nodes: [],
          pageInfo: { hasNextPage: "false", endCursor: null },
        },
      },
    },
  ])("stops publication for $reason", async ({ node }) => {
    const items = featureBoardItems("work")
    const fixture = createFixtureFetch(items)
    await expect(
      collectBoard({
        token: "fixture-token",
        now: () => FEATURE_OBSERVED_AT,
        fetch: async (url, init) => {
          const { variables } = JSON.parse(String(init?.body))
          if (variables.id)
            return new Response(JSON.stringify({ data: { node } }))
          return fixture(url, init)
        },
      }),
    ).rejects.toThrow(/timeline retrieval is incomplete/)
  })

  it.each([
    {
      reason: "EP: unreadable later page",
      cursors: ["first"],
      node: null,
      error: /could not be read/,
    },
    {
      reason: "EP: malformed later page",
      cursors: ["first"],
      node: { timelineItems: { nodes: [] } },
      error: /could not be read/,
    },
    {
      reason: "BVA: immediate repeated cursor",
      cursors: ["first", "first"],
      node: undefined,
      error: /did not advance/,
    },
    {
      reason: "BVA: cursor cycle across multiple pages",
      cursors: ["first", "second", "first"],
      node: undefined,
      error: /did not advance/,
    },
  ])("stops publication for $reason", async ({ cursors, node, error }) => {
    const items = featureBoardItems("work")
    const fixture = createFixtureFetch(items)
    let page = 0
    await expect(
      collectBoard({
        token: "fixture-token",
        now: () => FEATURE_OBSERVED_AT,
        fetch: async (url, init) => {
          const { variables } = JSON.parse(String(init?.body))
          if (!variables.id) return fixture(url, init)
          const next = page++
          return new Response(
            JSON.stringify({
              data: {
                node:
                  next > 0 && node !== undefined
                    ? node
                    : {
                        timelineItems: {
                          nodes: [],
                          pageInfo: {
                            hasNextPage: true,
                            endCursor: cursors[next],
                          },
                        },
                      },
              },
            }),
          )
        },
      }),
    ).rejects.toThrow(error)
  })
})
