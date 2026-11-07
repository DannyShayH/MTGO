import { describe, expect, it } from "vitest"
import { calculateFlowMetrics, type BoardDataset } from "./flow-metrics.ts"

const issue = (
  number: number,
  overrides: Partial<BoardDataset["items"][number]> = {},
) => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/DannyShayH/MTGO/issues/${number}`,
  status: "Backlog",
  workType: "development",
  subIssueCount: 0,
  state: "OPEN" as const,
  closeReason: null,
  closedAt: null,
  ...overrides,
})

const board = (items: BoardDataset["items"]): BoardDataset => ({
  source: "sample",
  observedAt: "2026-11-07T18:11:32Z",
  items,
})

describe("calculateFlowMetrics", () => {
  it("counts only work items in each WIP column and the separate ready queue", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, { status: "In Progress" }),
        issue(2, { status: "Delivery Initiated" }),
        issue(3, { status: "Ready" }),
        issue(4, { status: "In Progress", subIssueCount: 2 }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.inProgress).toMatchObject({ count: 1, limit: 3 })
    expect(metrics.inProgress.issues.map((item) => item.number)).toEqual([1])
    expect(metrics.deliveryInitiated).toMatchObject({ count: 1, limit: 2 })
    expect(metrics.ready).toMatchObject({ count: 1, limit: 5 })
    expect(metrics.ready.issues.map((item) => item.number)).toEqual([3])
  })

  it("groups completed issues by Copenhagen ISO week and work type", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-01T22:30:00Z",
          workType: "development",
        }),
        issue(2, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-01T23:30:00Z",
          workType: "documentation",
        }),
        issue(3, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-02T10:00:00Z",
          workType: "development",
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.throughput.map((week) => [week.week, week.count])).toEqual([
      ["2026-W44", 1],
      ["2026-W45", 2],
    ])
    expect(
      metrics.throughput[1].workTypes.map((type) => [type.name, type.count]),
    ).toEqual([
      ["development", 1],
      ["documentation", 1],
    ])
  })

  it("excludes parent issues, not planned closes, and closes after observation time", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-05T12:00:00Z",
          subIssueCount: 1,
        }),
        issue(2, {
          state: "CLOSED",
          closeReason: "NOT_PLANNED",
          closedAt: "2026-11-05T12:00:00Z",
        }),
        issue(3, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-08T12:00:00Z",
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.throughput).toEqual([])
  })

  it("moves a Sunday evening close to the next week in summer time too", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-06-28T21:30:00Z",
        }),
        issue(2, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-06-28T22:30:00Z",
        }),
      ]),
      "2026-07-07T10:00:00Z",
    )

    expect(metrics.throughput.map((week) => [week.week, week.count])).toEqual([
      ["2026-W26", 1],
      ["2026-W27", 1],
    ])
  })

  it("numbers weeks across a year boundary by their Thursday", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-12-31T12:00:00Z",
        }),
        issue(2, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2027-01-03T12:00:00Z",
        }),
        issue(3, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2027-01-04T12:00:00Z",
        }),
      ]),
      "2027-01-10T10:00:00Z",
    )

    expect(metrics.throughput.map((week) => [week.week, week.count])).toEqual([
      ["2026-W53", 2],
      ["2027-W01", 1],
    ])
  })

  it("gives each week its Monday and Sunday in Copenhagen time", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-01T23:30:00Z",
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.throughput[0]).toMatchObject({
      week: "2026-W45",
      start: "2026-11-02",
      end: "2026-11-08",
    })
  })

  it("ignores a closed item that still carries a WIP or ready status", () => {
    const closed = {
      state: "CLOSED" as const,
      closeReason: "COMPLETED" as const,
    }
    const metrics = calculateFlowMetrics(
      board([
        issue(1, { ...closed, status: "In Progress" }),
        issue(2, { ...closed, status: "Delivery Initiated" }),
        issue(3, { ...closed, status: "Ready" }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.inProgress.count).toBe(0)
    expect(metrics.deliveryInitiated.count).toBe(0)
    expect(metrics.ready.count).toBe(0)
  })

  it("adds both WIP columns into one total against the summed limits", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, { status: "In Progress" }),
        issue(2, { status: "In Progress" }),
        issue(3, { status: "Delivery Initiated" }),
        issue(4, { status: "Ready" }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.wip).toEqual({ count: 3, limit: 5 })
  })
})
