import { describe, expect, it } from "vitest"
import { FLOW_CORRECTIONS, type FlowCorrection } from "./flow-corrections.ts"
import { calculateFlowMetrics, type BoardDataset } from "./flow-metrics.ts"

const OBSERVED_AT = "2026-11-23T15:00:00Z"
const LATE_CLOSE = "2026-11-23T14:32:21Z"
const DONE_AT = "2026-11-12T16:50:55Z"

const closedLate = (
  overrides: Partial<BoardDataset["items"][number]> = {},
): BoardDataset["items"][number] => ({
  number: 99,
  title: "Closed days after Done",
  url: "https://github.com/DannyShayH/MTGO/issues/99",
  status: "Done",
  workType: "development",
  subIssueCount: 0,
  state: "CLOSED",
  closeReason: "COMPLETED",
  closedAt: LATE_CLOSE,
  startedAt: "2026-11-12",
  workStartedAt: "2026-11-12T15:49:41Z",
  blocked: false,
  reopened: false,
  priority: null,
  size: null,
  statusChanges: [
    { to: "In Progress", at: "2026-11-12T15:49:41Z" },
    { to: "Done", at: DONE_AT },
  ],
  stateChanges: [{ state: "CLOSED", at: LATE_CLOSE }],
  ...overrides,
})

const board = (items: BoardDataset["items"]): BoardDataset => ({
  source: "board",
  observedAt: OBSERVED_AT,
  items,
})

const lateClose: FlowCorrection = {
  number: 99,
  reason: "Done on the board, closed later",
  close: { recordedClosedAt: LATE_CLOSE, deliveredAt: DONE_AT },
}

describe("flow corrections", () => {
  it("ends cycle time and throughput at the delivery moment instead of the late close", () => {
    const metrics = calculateFlowMetrics(board([closedLate()]), OBSERVED_AT, [
      lateClose,
    ])
    expect(metrics.cycleTime).toMatchObject([
      { number: 99, closedAt: "2026-11-12", days: 0, elapsedMinutes: 61 },
    ])
    expect(metrics.cycleTimeWeeks.map((week) => week.week)).toEqual([
      "2026-W46",
    ])
    expect(metrics.throughput.map((week) => week.week)).toEqual(["2026-W46"])
  })

  it("leaves the item untouched without a correction", () => {
    const metrics = calculateFlowMetrics(board([closedLate()]), OBSERVED_AT)
    expect(metrics.cycleTime).toMatchObject([
      { number: 99, closedAt: "2026-11-23", days: 11 },
    ])
  })

  it("stops applying a close correction once GitHub reports another close", () => {
    const closedAgain = "2026-11-25T09:00:00Z"
    const metrics = calculateFlowMetrics(
      board([closedLate({ closedAt: closedAgain })]),
      "2026-11-26T00:00:00Z",
      [lateClose],
    )
    expect(metrics.cycleTime).toMatchObject([
      { number: 99, closedAt: "2026-11-25" },
    ])
  })

  it("does not change the cumulative flow, which keeps GitHub's history", () => {
    const items = [closedLate()]
    const corrected = calculateFlowMetrics(board(items), OBSERVED_AT, [
      lateClose,
    ])
    const plain = calculateFlowMetrics(board(items), OBSERVED_AT)
    expect(corrected.cumulativeFlow).toEqual(plain.cumulativeFlow)
  })

  it("fills a missing start date and start time, so the data problem goes away", () => {
    const missingStart = closedLate({ startedAt: null, workStartedAt: null })
    const start: FlowCorrection = {
      number: 99,
      reason: "Started without gh workon",
      start: { startedAt: "2026-11-12", workStartedAt: "2026-11-12T15:49:41Z" },
    }
    const plain = calculateFlowMetrics(board([missingStart]), OBSERVED_AT)
    expect(plain.dataProblems).toMatchObject([
      { number: 99, problem: "Missing start date" },
    ])
    const corrected = calculateFlowMetrics(board([missingStart]), OBSERVED_AT, [
      start,
    ])
    expect(corrected.dataProblems).toEqual([])
    expect(corrected.cycleTime).toMatchObject([{ number: 99, days: 11 }])
  })

  it("never replaces a start the board already has", () => {
    const metrics = calculateFlowMetrics(board([closedLate()]), OBSERVED_AT, [
      {
        number: 99,
        reason: "Stale correction",
        start: {
          startedAt: "2026-11-01",
          workStartedAt: "2026-11-01T08:00:00Z",
        },
      },
    ])
    expect(metrics.cycleTime).toMatchObject([{ number: 99, days: 11 }])
  })

  it("keeps at most one correction per issue, each with a reason", () => {
    const numbers = FLOW_CORRECTIONS.map((correction) => correction.number)
    expect(new Set(numbers).size).toBe(numbers.length)
    for (const correction of FLOW_CORRECTIONS) {
      expect(correction.reason.trim()).not.toBe("")
      expect(correction.close ?? correction.start).toBeDefined()
    }
  })
})
