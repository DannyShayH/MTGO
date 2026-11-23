/**
 * A hand-kept fix for an issue whose board data is wrong and cannot be changed
 * on GitHub (a close date cannot be edited). Corrections only change
 * throughput, cycle time and data problems; the cumulative flow, WIP and
 * Features keep GitHub's own history.
 */
export type FlowCorrection = {
  number: number
  /** Why the board data is wrong and where the corrected value comes from */
  reason: string
  /**
   * The issue was Done on the board but closed later. `deliveredAt` replaces
   * the close only while GitHub still reports `recordedClosedAt`, so a reopen
   * and a new close make the correction stop applying by itself.
   */
  close?: { recordedClosedAt: string; deliveredAt: string }
  /**
   * Fills a missing Start date or start time; never replaces a value the board
   * already has. The value is the issue's own move to In Progress, or, when
   * there is none, a team estimate the reason states.
   */
  start?: { startedAt?: string; workStartedAt?: string }
}

export const FLOW_CORRECTIONS: FlowCorrection[] = [
  {
    number: 69,
    reason:
      "Went from Backlog straight to Delivery Initiated, so no In Progress event; the team estimates 45 minutes of work before the close",
    start: { workStartedAt: "2026-11-12T11:24:43Z" },
  },
  {
    number: 82,
    reason:
      "Went from Backlog straight to Delivery Initiated, so no In Progress event; the team estimates 45 minutes of work before the close",
    start: { workStartedAt: "2026-11-12T22:49:13Z" },
  },
  {
    number: 96,
    reason:
      "Went from Backlog straight to Delivery Initiated, so no In Progress event; the team estimates 45 minutes of work before the close",
    start: { workStartedAt: "2026-11-12T15:20:01Z" },
  },
  {
    number: 115,
    reason: "Moved to Done on 14 November but only closed on 23 November",
    close: {
      recordedClosedAt: "2026-11-23T14:32:02Z",
      deliveredAt: "2026-11-14T13:43:17Z",
    },
  },
  {
    number: 116,
    reason: "Moved to Done on 14 November but only closed on 23 November",
    close: {
      recordedClosedAt: "2026-11-23T14:32:14Z",
      deliveredAt: "2026-11-14T13:40:34Z",
    },
  },
  {
    number: 99,
    reason: "Moved to Done on 12 November but only closed on 23 November",
    close: {
      recordedClosedAt: "2026-11-23T14:32:21Z",
      deliveredAt: "2026-11-12T16:50:55Z",
    },
  },
  {
    number: 153,
    reason: "Moved to Done on 18 November but only closed on 23 November",
    close: {
      recordedClosedAt: "2026-11-23T14:32:32Z",
      deliveredAt: "2026-11-18T09:36:11Z",
    },
  },
  {
    number: 187,
    reason:
      "Moved to Done on 19 November but only closed on 23 November; no Start date, so it comes from the first move to In Progress",
    close: {
      recordedClosedAt: "2026-11-23T14:33:27Z",
      deliveredAt: "2026-11-19T07:30:54Z",
    },
    start: { startedAt: "2026-11-19", workStartedAt: "2026-11-19T07:21:48Z" },
  },
]

/**
 * The fields a correction can change. Typed here rather than importing
 * `BoardIssue`, which would make flow-metrics.ts and this file import each
 * other (the no-circular architecture rule).
 */
type CorrectableItem = {
  number: number
  closedAt: string | null
  startedAt: string | null
  workStartedAt: string | null
}

/** The item as flow metrics should measure it, with its correction applied */
export function correctedItem<Item extends CorrectableItem>(
  item: Item,
  corrections: FlowCorrection[],
): Item {
  const correction = corrections.find(({ number }) => number === item.number)
  if (!correction) return item
  const { close, start } = correction
  return {
    ...item,
    closedAt:
      close && item.closedAt === close.recordedClosedAt
        ? close.deliveredAt
        : item.closedAt,
    startedAt: item.startedAt ?? start?.startedAt ?? null,
    workStartedAt: item.workStartedAt ?? start?.workStartedAt ?? null,
  }
}
