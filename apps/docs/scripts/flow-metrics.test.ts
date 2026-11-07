import { describe, expect, it } from "vitest"
import {
  calculateFlowMetrics,
  workStartedAt,
  type BoardDataset,
} from "./flow-metrics.ts"
import sample from "./board-sample.json"

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
  startedAt: null,
  workStartedAt: null,
  blocked: false,
  reopened: false,
  ...overrides,
})

const board = (items: BoardDataset["items"]): BoardDataset => ({
  source: "sample",
  observedAt: "2026-11-07T18:11:32Z",
  items,
})

describe("calculateFlowMetrics", () => {
  it("shows elapsed minutes beside the calendar-day cycle time", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(16, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-07",
          workStartedAt: "2026-11-07T09:00:00Z",
          closedAt: "2026-11-07T09:51:00Z",
        }),
      ]),
      "2026-11-07T10:00:00Z",
    )

    expect(metrics.cycleTime[0]).toMatchObject({
      display: "< 1 day",
      elapsedMinutes: 51,
      elapsedDisplay: "51 min",
    })
  })

  it("keeps calendar cycle time but reports missing precise start time", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(4, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-07",
          closedAt: "2026-11-07T09:51:00Z",
        }),
      ]),
      "2026-11-07T10:00:00Z",
    )

    expect(metrics.cycleTime[0]).toMatchObject({
      display: "< 1 day",
      elapsedMinutes: null,
      elapsedDisplay: "Not available",
    })
    expect(metrics.dataProblems).toContainEqual(
      expect.objectContaining({ number: 4, problem: "Missing start time" }),
    )
  })

  it("measures real elapsed time across the autumn clock change", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(5, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-10-25",
          workStartedAt: "2026-10-25T00:30:00Z",
          closedAt: "2026-10-25T02:30:00Z",
        }),
      ]),
      "2026-10-25T03:00:00Z",
    )

    expect(metrics.cycleTime[0]).toMatchObject({
      display: "< 1 day",
      elapsedMinutes: 120,
      elapsedDisplay: "2 hr",
    })
  })

  it("does not invent elapsed time when the start event is after the close", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(6, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-07",
          workStartedAt: "2026-11-07T10:00:00Z",
          closedAt: "2026-11-07T09:51:00Z",
        }),
      ]),
      "2026-11-07T11:00:00Z",
    )

    expect(metrics.cycleTime[0].elapsedDisplay).toBe("Not available")
    expect(metrics.dataProblems).toContainEqual(
      expect.objectContaining({ number: 6, problem: "Invalid start time" }),
    )
  })

  it("does not invent elapsed time from an unparseable start timestamp", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(7, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-07",
          workStartedAt: "yesterday",
          closedAt: "2026-11-07T09:51:00Z",
        }),
      ]),
      "2026-11-07T11:00:00Z",
    )

    expect(metrics.cycleTime[0]).toMatchObject({
      display: "< 1 day",
      elapsedDisplay: "Not available",
    })
    expect(metrics.dataProblems).toContainEqual(
      expect.objectContaining({ number: 7, problem: "Invalid start time" }),
    )
  })

  it("leaves out a Start date that is invalid or after the close from cycle time and age", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(8, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-09",
          closedAt: "2026-11-07T09:00:00Z",
        }),
        issue(9, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "soon",
          closedAt: "2026-11-07T09:00:00Z",
        }),
        issue(10, { status: "In Progress", startedAt: "2026-11-20" }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(metrics.cycleTime).toEqual([])
    expect(metrics.cycleTimeWeeks).toEqual([])
    expect(metrics.activeWork).toEqual([])
    expect(metrics.throughput[0].count).toBe(2)
    expect(
      metrics.dataProblems.map((item) => [item.number, item.problem]),
    ).toEqual([
      [8, "Invalid start date"],
      [9, "Invalid start date"],
      [10, "Invalid start date"],
    ])
  })

  it("shows sample issue #2 as a data problem while keeping it in throughput", () => {
    const metrics = calculateFlowMetrics(
      sample as BoardDataset,
      sample.observedAt,
    )
    expect(metrics.dataProblems.map((item) => item.number)).toContain(2)
    expect(metrics.cycleTime.map((item) => item.number)).not.toContain(2)
    expect(
      metrics.throughput.flatMap((week) =>
        week.workTypes.flatMap((type) =>
          type.issues.map((item) => item.number),
        ),
      ),
    ).toContain(2)
    expect(
      metrics.cycleTime.find((item) => item.number === 4)?.elapsedDisplay,
    ).toBe("10 min")
  })
  it("counts Copenhagen calendar dates exclusively across the winter clock change and shows same-day work as less than a day", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-10-24",
          closedAt: "2026-10-25T23:30:00Z",
        }),
        issue(2, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-07",
          closedAt: "2026-11-07T09:00:00Z",
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )

    expect(
      metrics.cycleTime.map((item) => [item.number, item.days, item.display]),
    ).toEqual([
      [1, 2, "2 days"],
      [2, 0, "< 1 day"],
    ])
    expect(
      metrics.cycleTimeWeeks.map((week) => [
        week.week,
        week.averageDays,
        week.count,
      ]),
    ).toEqual([
      ["2026-W44", 2, 1],
      ["2026-W45", 0, 1],
    ])
  })

  it("uses the last close date and marks reopened work", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-11-02",
          closedAt: "2026-11-04T12:00:00Z",
          reopened: true,
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )
    expect(metrics.cycleTime[0]).toMatchObject({ days: 2, reopened: true })
  })

  it("keeps a completed item without start date in throughput and lists the data problem", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(2, {
          state: "CLOSED",
          closeReason: "COMPLETED",
          closedAt: "2026-11-05T12:00:00Z",
        }),
        issue(3, { status: "In Progress" }),
      ]),
      "2026-11-07T18:11:32Z",
    )
    expect(metrics.throughput[0].count).toBe(1)
    expect(metrics.cycleTime).toEqual([])
    expect(
      metrics.dataProblems.map((item) => [item.number, item.problem]),
    ).toEqual([
      [2, "Missing start date"],
      [3, "Missing start date"],
    ])
  })

  it("lists active work oldest first and blocked work with WIP first", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, { status: "In Progress", startedAt: "2026-11-01" }),
        issue(2, {
          status: "Delivery Initiated",
          startedAt: "2026-11-05",
          blocked: true,
        }),
        issue(3, { status: "Ready", startedAt: "2026-11-03", blocked: true }),
      ]),
      "2026-11-07T18:11:32Z",
    )
    expect(
      metrics.activeWork.map((item) => [item.number, item.ageDays, item.old]),
    ).toEqual([
      [1, 6, true],
      [3, 4, false],
      [2, 2, false],
    ])
    expect(metrics.blocked.map((item) => item.number)).toEqual([2, 3])
    expect(metrics.agingLimit).toEqual({ kind: "fixed", days: 5 })
  })

  it("switches to the 85th percentile after ten completed work items with start dates", () => {
    const completed = Array.from({ length: 10 }, (_, index) =>
      issue(index + 1, {
        state: "CLOSED",
        closeReason: "COMPLETED",
        startedAt: "2026-11-01",
        closedAt: `2026-11-${String(index + 2).padStart(2, "0")}T12:00:00Z`,
      }),
    )
    const metrics = calculateFlowMetrics(
      board([
        ...completed,
        issue(11, { status: "In Progress", startedAt: "2026-11-02" }),
      ]),
      "2026-11-12T12:00:00Z",
    )
    expect(metrics.agingLimit).toEqual({ kind: "percentile", days: 9 })
    expect(metrics.activeWork[0]).toMatchObject({ ageDays: 10, old: true })
  })

  it("keeps the fixed aging limit with nine completed work items", () => {
    const completed = Array.from({ length: 9 }, (_, index) =>
      issue(index + 1, {
        state: "CLOSED",
        closeReason: "COMPLETED",
        startedAt: "2026-11-01",
        closedAt: `2026-11-${String(index + 2).padStart(2, "0")}T12:00:00Z`,
      }),
    )
    const metrics = calculateFlowMetrics(
      board([
        ...completed,
        issue(11, { status: "In Progress", startedAt: "2026-11-05" }),
      ]),
      "2026-11-12T12:00:00Z",
    )
    expect(metrics.agingLimit).toEqual({ kind: "fixed", days: 5 })
    expect(metrics.activeWork[0]).toMatchObject({ ageDays: 7, old: true })
  })

  it("lists not planned closes separately from delivery metrics", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(1, {
          state: "CLOSED",
          closeReason: "NOT_PLANNED",
          closedAt: "2026-11-06T12:00:00Z",
        }),
      ]),
      "2026-11-07T18:11:32Z",
    )
    expect(metrics.closedWithoutDelivery.map((item) => item.number)).toEqual([
      1,
    ])
    expect(metrics.throughput).toEqual([])
    expect(metrics.cycleTime).toEqual([])
  })
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

describe("workStartedAt", () => {
  const moves = [
    { to: "In Progress", at: "2026-11-07T13:00:00Z" },
    { to: "Ready", at: "2026-11-06T08:00:00Z" },
    { to: "In Progress", at: "2026-11-07T08:15:00Z" },
    { to: "In Progress", at: "2026-11-05T09:00:00Z" },
  ]

  it("takes the first move to In Progress on the Start date", () => {
    expect(workStartedAt("2026-11-07", moves)).toBe("2026-11-07T08:15:00Z")
  })

  it("reads the Start date in Copenhagen time", () => {
    expect(
      workStartedAt("2026-11-08", [
        { to: "In Progress", at: "2026-11-07T23:30:00Z" },
      ]),
    ).toBe("2026-11-07T23:30:00Z")
  })

  it("is null without a move on the Start date, a Start date or a valid time", () => {
    expect(workStartedAt("2026-11-09", moves)).toBeNull()
    expect(workStartedAt(null, moves)).toBeNull()
    expect(
      workStartedAt("2026-11-07", [{ to: "In Progress", at: "not a time" }]),
    ).toBeNull()
  })
})
