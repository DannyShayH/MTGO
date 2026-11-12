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
  priority: null,
  size: null,
  statusChanges: [],
  ...overrides,
})

const board = (items: BoardDataset["items"]): BoardDataset => ({
  source: "sample",
  observedAt: "2026-11-07T18:11:32Z",
  items,
})

describe("calculateFlowMetrics", () => {
  it.each([
    {
      title: "Feature: Empty capability",
      subIssueCount: 0,
      excluded: true,
      reason: "EP: empty Feature",
    },
    {
      title: "Feature: Populated capability",
      subIssueCount: 2,
      excluded: true,
      reason: "DT: Feature with children",
    },
    {
      title: "Ordinary parent",
      subIssueCount: 2,
      excluded: true,
      reason: "DT: structural parent without Feature prefix",
    },
    {
      title: "Standalone work",
      subIssueCount: 0,
      excluded: false,
      reason: "EP: standalone work item",
    },
    {
      title: "Implement Feature: ordering",
      subIssueCount: 0,
      excluded: false,
      reason: "BVA: prefix only counts at title start",
    },
    {
      title: "Feature:missing space",
      subIssueCount: 0,
      excluded: false,
      reason: "BVA: mandatory prefix includes a space",
    },
  ])("$reason", ({ title, subIssueCount, excluded }) => {
    const observedAt = "2026-11-12T12:00:00Z"
    const work = Array.from({ length: 9 }, (_, index) =>
      issue(index + 1, {
        status: "In Progress",
        startedAt: "2026-11-11",
        statusChanges: [{ to: "In Progress", at: "2026-11-11T09:00:00Z" }],
      }),
    )
    const baseline = calculateFlowMetrics(board(work), observedAt)
    const candidates = [
      "Ready",
      "In Progress",
      "Delivery Initiated",
      "Done",
    ].map((status, index) =>
      issue(100 + index, {
        title,
        subIssueCount,
        status,
        blocked: true,
        startedAt: "2026-11-01",
        workStartedAt: "2026-11-01T09:00:00Z",
        ...(status === "Done"
          ? {
              state: "CLOSED" as const,
              closeReason: "COMPLETED" as const,
              closedAt: "2026-11-10T12:00:00Z",
            }
          : {}),
        statusChanges: [{ to: status, at: "2026-11-01T09:00:00Z" }],
      }),
    )
    const metrics = calculateFlowMetrics(
      board([...work, ...candidates]),
      observedAt,
    )
    if (excluded) expect({ ...metrics, features: [] }).toEqual(baseline)
    else {
      expect(metrics.wip.count).toBe(11)
      expect(metrics.ready.count).toBe(1)
      expect(metrics.throughput[0].count).toBe(1)
      expect(metrics.cycleTime[0].days).toBe(9)
      expect(metrics.activeWork).toHaveLength(12)
      expect(metrics.blocked).toHaveLength(3)
    }
  })

  it("keeps Feature durations and missing dates out of the work-item aging threshold and diagnostics", () => {
    const observedAt = "2026-11-12T12:00:00Z"
    const work = Array.from({ length: 9 }, (_, index) =>
      issue(index + 1, {
        state: "CLOSED",
        closeReason: "COMPLETED",
        startedAt: "2026-11-10",
        workStartedAt: "2026-11-10T09:00:00Z",
        closedAt: "2026-11-11T12:00:00Z",
      }),
    )
    const baseline = calculateFlowMetrics(board(work), observedAt)
    const metrics = calculateFlowMetrics(
      board([
        ...work,
        issue(100, {
          title: "Feature: Long capability",
          state: "CLOSED",
          closeReason: "COMPLETED",
          startedAt: "2026-10-01",
          closedAt: "2026-11-11T12:00:00Z",
        }),
        issue(101, { title: "Feature: Missing start", status: "In Progress" }),
        issue(102, {
          title: "Feature: Withdrawn capability",
          state: "CLOSED",
          closeReason: "NOT_PLANNED",
          closedAt: "2026-11-11T12:00:00Z",
        }),
      ]),
      observedAt,
    )
    expect({ ...metrics, features: [] }).toEqual(baseline)
    expect(metrics.agingLimit).toEqual({ kind: "fixed", days: 5 })
    expect(metrics.throughput[0].count).toBe(9)
  })

  it("reports independent Ready and Delivery Initiated breaches without a false simultaneous handoff", () => {
    const start = "2026-11-07T08:00:00Z"
    const transfer = "2026-11-07T09:00:00Z"
    const metrics = calculateFlowMetrics(
      board([
        ...[1, 2, 3, 4, 5, 6].map((number) =>
          issue(number, {
            status: "Ready",
            statusChanges: [{ to: "Ready", at: start }],
          }),
        ),
        ...[7, 8, 9].map((number) =>
          issue(number, {
            status: "Delivery Initiated",
            statusChanges: [{ to: "Delivery Initiated", at: start }],
          }),
        ),
        ...[10, 11].map((number) =>
          issue(number, {
            status: "In Progress",
            statusChanges: [{ to: "In Progress", at: start }],
          }),
        ),
        issue(12, {
          status: "Done",
          statusChanges: [
            { to: "In Progress", at: start },
            { to: "Done", at: transfer },
          ],
        }),
        issue(13, {
          status: "In Progress",
          statusChanges: [{ to: "In Progress", at: transfer }],
        }),
      ]),
      "2026-11-07T10:00:00Z",
    )
    expect(metrics.wipBreaches).toEqual([
      {
        column: "Delivery Initiated",
        limit: 2,
        start,
        end: null,
        peakExcess: 1,
      },
      { column: "Ready", limit: 5, start, end: null, peakExcess: 1 },
    ])
  })

  it("keeps Copenhagen daily samples continuous across the autumn clock change", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(20, {
          status: "Ready",
          statusChanges: [
            { to: "Backlog", at: "2026-10-24T21:30:00Z" },
            { to: "Ready", at: "2026-10-24T22:30:00Z" },
            { to: "In Progress", at: "2026-10-27T08:00:00Z" },
          ],
        }),
      ]),
      "2026-10-26T12:00:00Z",
    )
    expect(
      metrics.cumulativeFlow.map(({ date, counts }) => [
        date,
        counts.Backlog,
        counts.Ready,
        counts["In Progress"],
      ]),
    ).toEqual([
      ["2026-10-24", 1, 0, 0],
      ["2026-10-25", 0, 1, 0],
      ["2026-10-26", 0, 1, 0],
    ])
  })

  it("uses missing history only at collection and handles an empty board", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(20, {
          status: "Ready",
          statusChanges: [{ to: "Ready", at: "2026-11-06T12:00:00Z" }],
        }),
        issue(21, { status: "Backlog" }),
        issue(22, {
          status: "Done",
          state: "CLOSED",
          closeReason: "NOT_PLANNED",
          closedAt: "2026-11-06T14:00:00Z",
        }),
      ]),
      "2026-11-07T12:00:00Z",
    )
    expect(
      metrics.cumulativeFlow.map(({ counts }) => [
        counts.Backlog,
        counts.Ready,
        counts.Done,
      ]),
    ).toEqual([
      [0, 1, 0],
      [1, 1, 1],
    ])
    const empty = calculateFlowMetrics(board([]), "2026-11-07T12:00:00Z")
    expect([empty.cumulativeFlow, empty.wipBreaches]).toEqual([[], []])
  })

  it("measures continuous intraday breaches, peak excess, and open periods using close and reopen times", () => {
    const metrics = calculateFlowMetrics(
      board([
        ...[1, 2, 3].map((number) =>
          issue(number, {
            status: "In Progress",
            statusChanges: [{ to: "In Progress", at: "2026-11-07T08:00:00Z" }],
          }),
        ),
        issue(4, {
          status: "In Progress",
          statusChanges: [{ to: "In Progress", at: "2026-11-07T09:00:00Z" }],
          stateChanges: [
            { state: "CLOSED", at: "2026-11-07T11:00:00Z" },
            { state: "OPEN", at: "2026-11-07T12:00:00Z" },
          ],
        }),
        issue(5, {
          status: "Ready",
          statusChanges: [
            { to: "In Progress", at: "2026-11-07T10:00:00Z" },
            { to: "Ready", at: "2026-11-07T10:30:00Z" },
          ],
        }),
      ]),
      "2026-11-07T13:00:00Z",
    )
    expect(metrics.wipBreaches).toEqual([
      {
        column: "In Progress",
        limit: 3,
        start: "2026-11-07T09:00:00Z",
        end: "2026-11-07T11:00:00Z",
        peakExcess: 2,
      },
      {
        column: "In Progress",
        limit: 3,
        start: "2026-11-07T12:00:00Z",
        end: null,
        peakExcess: 1,
      },
    ])
  })

  it("rebuilds daily status counts with backward moves and no duplicate Backlog arrivals", () => {
    const metrics = calculateFlowMetrics(
      board([
        issue(20, {
          status: "Ready",
          statusChanges: [
            { to: "Backlog", at: "2026-11-06T09:00:00Z" },
            { to: "In Progress", at: "2026-11-07T09:00:00Z" },
            { to: "Ready", at: "2026-11-07T23:00:00Z" },
          ],
        }),
        issue(21, {
          statusChanges: [
            { to: "Backlog", at: "2026-11-06T10:00:00Z" },
            { to: "Backlog", at: "2026-11-06T10:01:00Z" },
          ],
        }),
        issue(12, {
          subIssueCount: 2,
          statusChanges: [{ to: "Backlog", at: "2026-11-05T09:00:00Z" }],
        }),
      ]),
      "2026-11-09T12:00:00Z",
    )
    expect(
      metrics.cumulativeFlow.map(({ date, counts }) => [
        date,
        counts.Backlog,
        counts.Ready,
        counts["In Progress"],
      ]),
    ).toEqual([
      ["2026-11-06", 2, 0, 0],
      ["2026-11-07", 1, 0, 1],
      ["2026-11-08", 1, 1, 0],
      ["2026-11-09", 1, 1, 0],
    ])
  })

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
