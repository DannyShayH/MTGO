import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  INITIAL_ARRIVALS,
  dismissArrivals,
  namedArrivals,
  noticeArrivals,
  type ArrivalState,
  type AwaitingRead,
} from "../arrivals.ts"

/** The backend's clock at the screen's first read. */
const OPENED = "2026-11-19T12:00:00.000Z"
const LATER = "2026-11-19T12:01:00.000Z"

const order = (
  number: number,
  placed_at: string | null = "2026-11-19T12:00:30.000Z",
) => ({ id: `order_${number}`, display_id: number, placed_at })

/** A complete read of the awaiting queue holding these Order numbers. */
const read = (numbers: number[], server_time = LATER): AwaitingRead => ({
  orders: numbers.map((number) => order(number)),
  count: numbers.length,
  server_time,
})

/** Feeds the reads in turn; returns the last state and each read's alerts. */
function replayReads(
  reads: AwaitingRead[],
  state: ArrivalState = INITIAL_ARRIVALS,
) {
  const raised: number[][] = []
  for (const next of reads) {
    const result = noticeArrivals(state, next)
    state = result.state
    raised.push(result.arrivals.map(({ display_id }) => display_id))
  }
  return { state, raised }
}

describe("Kitchen arrival alerts", () => {
  const opened = read([1], OPENED)
  for (const { reads, alerted, reason } of [
    {
      reads: [read([1, 2], OPENED)],
      alerted: [],
      reason: "DT: the first read is the baseline (history load)",
    },
    {
      reads: [opened, read([1, 2])],
      alerted: [2],
      reason: "DT: unknown and placed after the first read",
    },
    {
      reads: [opened, read([1, 2]), read([2, 1]), read([1, 2])],
      alerted: [2],
      reason: "DT: already known (repeated hints, reconnect replays, polls)",
    },
    {
      reads: [
        opened,
        { ...read([]), orders: [order(2, "2026-11-19T11:59:59.999Z")] },
      ],
      alerted: [],
      reason:
        "BVA: placed 1 ms before the first read (it waited beyond the first page)",
    },
    {
      reads: [opened, { ...read([]), orders: [order(2, OPENED)] }],
      alerted: [2],
      reason: "BVA: placed exactly at the first read",
    },
    {
      reads: [
        opened,
        { ...read([]), orders: [order(2, "2026-11-19T12:00:00.001Z")] },
      ],
      alerted: [2],
      reason: "BVA: placed 1 ms after the first read",
    },
    {
      reads: [opened, { ...read([]), orders: [order(2, null)] }],
      alerted: [],
      reason: "EP: placed before timings were recorded, so history",
    },
  ])
    it(`decides whether a seen Order raises an alert: ${reason}`, () => {
      assert.deepEqual(replayReads(reads).raised.flat(), alerted)
    })

  const alerted = replayReads([read([1], OPENED), read([1, 2])]).state
  for (const { next, pending, reason } of [
    {
      next: { ...read([1]), count: 1 },
      pending: [],
      reason:
        "BVA: the page holds the whole queue (count = page size), so Order 2 stopped awaiting",
    },
    {
      next: { ...read([1]), count: 2 },
      pending: [order(2)],
      reason:
        "BVA: one more awaiting than the page (count = page size + 1), so Order 2 may be beyond it",
    },
    {
      next: read([2, 1]),
      pending: [order(2)],
      reason: "EP: Order 2 still awaits acceptance",
    },
  ])
    it(`keeps an alert only while its Order may still await acceptance: ${reason}`, () => {
      assert.deepEqual(noticeArrivals(alerted, next).state.pending, pending)
    })

  it("an Order that stopped awaiting never alerts again when it is reread", () => {
    const dropped = replayReads([read([1])], alerted).state
    assert.deepEqual(replayReads([read([1, 2])], dropped).raised, [[]])
  })

  it("dismissing hides the alert and a reconnect replay of the same Orders stays silent", () => {
    const dismissed = dismissArrivals(alerted)
    assert.deepEqual(dismissed.pending, [])
    const { state, raised } = replayReads(
      [read([1, 2]), read([1, 2, 4])],
      dismissed,
    )
    assert.deepEqual(raised, [[], [4]])
    assert.deepEqual(state.pending, [order(4)])
  })

  for (const { numbers, named, more, reason } of [
    { numbers: [7], named: [7], more: 0, reason: "EP: one arrival" },
    {
      numbers: [7, 8, 9],
      named: [7, 8, 9],
      more: 0,
      reason: "BVA: three arrivals, the most the banner names",
    },
    {
      numbers: [7, 8, 9, 10],
      named: [7, 8, 9],
      more: 1,
      reason: "BVA: four arrivals, one more than the banner names",
    },
  ])
    it(`names the oldest arrivals and counts the rest: ${reason}`, () => {
      const result = namedArrivals(numbers.map((number) => order(number)))
      assert.deepEqual(
        {
          named: result.named.map(({ display_id }) => display_id),
          more: result.more,
        },
        { named, more },
      )
    })
})
