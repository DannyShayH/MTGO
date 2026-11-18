import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  INITIAL_CONNECTION,
  nextConnection,
  type ConnectionEvent,
  type ConnectionState,
} from "../connection.ts"

const state = (overrides: Partial<ConnectionState>): ConnectionState => ({
  ...INITIAL_CONNECTION,
  ...overrides,
})

describe("The kitchen screen's connection", () => {
  const cases: {
    from: ConnectionState
    event: ConnectionEvent
    status: ConnectionState["status"]
    effects: Record<string, unknown>
    reason: string
  }[] = [
    {
      from: INITIAL_CONNECTION,
      event: "stream_ready",
      status: "connecting",
      effects: { reload: true },
      reason:
        "DT: connecting, the feed opens: reconcile, not live until proven",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 2 }),
      event: "stream_ready",
      status: "reconnecting",
      effects: { reload: true },
      reason: "DT: reconnecting, the feed opens again: reconcile, await proof",
    },
    {
      from: state({ status: "fallback", streamFailures: 3 }),
      event: "stream_ready",
      status: "fallback",
      effects: { reload: true },
      reason: "DT: polling, a restored feed opens: keep polling until proven",
    },
    {
      from: state({ isStreamUnproven: true }),
      event: "heartbeat_received",
      status: "live",
      effects: {},
      reason: "DT: an open feed's first heartbeat proves it: live",
    },
    {
      from: state({ status: "reconnecting", isStreamUnproven: true }),
      event: "orders_hinted",
      status: "live",
      effects: { reload: true },
      reason: "DT: an open feed's first hint proves it: live, read the Orders",
    },
    {
      from: state({
        status: "fallback",
        streamFailures: 3,
        isStreamUnproven: true,
      }),
      event: "heartbeat_received",
      status: "live",
      effects: { stopPolling: true },
      reason: "DT: polling, the restored feed is proven: stop polling",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 1 }),
      event: "heartbeat_received",
      status: "reconnecting",
      effects: {},
      reason: "DT: an event without an open feed proves nothing",
    },
    {
      from: state({ status: "live", streamFailures: 2 }),
      event: "heartbeat_received",
      status: "live",
      effects: {},
      reason: "DT: live, a heartbeat proves the feed stays open",
    },
    {
      from: state({ status: "live" }),
      event: "refresh_requested",
      status: "live",
      effects: { reload: true },
      reason: "DT: live, manual refresh: read fresh Orders",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 1 }),
      event: "refresh_requested",
      status: "reconnecting",
      effects: { reload: true, openStreamInMs: 0 },
      reason: "DT: reconnecting, manual refresh: read Orders and reconnect now",
    },
    {
      from: state({ status: "reconnecting", isStreamUnproven: true }),
      event: "refresh_requested",
      status: "reconnecting",
      effects: { reload: true },
      reason:
        "DT: manual refresh while a feed is opening: read Orders, keep it",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 1 }),
      event: "reload_failed",
      status: "reconnecting",
      effects: {},
      reason:
        "DT: reconnecting, the reload check fails: the feed keeps its attempts",
    },
    {
      from: state({ status: "connecting" }),
      event: "reload_failed",
      status: "connecting",
      effects: {},
      reason: "DT: connecting, the reload check fails: no polling yet",
    },
    {
      from: state({ status: "fallback", streamFailures: 3 }),
      event: "reload_failed",
      status: "offline",
      effects: { pollInMs: 5000 },
      reason: "DT: polling, the reload check fails: offline, back off",
    },
    {
      from: state({ status: "live" }),
      event: "reload_failed",
      status: "live",
      effects: {},
      reason:
        "DT: live, the reload check fails: the feed and reconciliation decide",
    },
    {
      from: state({ status: "offline", streamFailures: 3, pollFailures: 2 }),
      event: "refresh_requested",
      status: "offline",
      effects: { reload: true, pollInMs: 0, openStreamInMs: 0 },
      reason: "DT: offline, manual refresh: read Orders, try both transports",
    },
    {
      from: state({ status: "live" }),
      event: "orders_hinted",
      status: "live",
      effects: { reload: true },
      reason: "DT: live, a hint arrives: read fresh Orders",
    },
    {
      from: state({ status: "live" }),
      event: "stream_failed",
      status: "reconnecting",
      effects: { openStreamInMs: 1000 },
      reason: "DT: live, the feed drops: reconnect after 1 s",
    },
    {
      from: state({ status: "live" }),
      event: "heartbeat_missed",
      status: "reconnecting",
      effects: { openStreamInMs: 1000 },
      reason: "DT: live but silent (a buffering proxy): treat as dropped",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 1 }),
      event: "stream_failed",
      status: "reconnecting",
      effects: { openStreamInMs: 2000 },
      reason: "BVA: second failure doubles the wait",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 2 }),
      event: "stream_failed",
      status: "reconnecting",
      effects: { pollInMs: 0, openStreamInMs: 60000 },
      reason: "BVA: third failure starts polling now, retries streaming later",
    },
    {
      from: state({ status: "reconnecting", streamFailures: 3 }),
      event: "poll_succeeded",
      status: "fallback",
      effects: { reload: true, pollInMs: 15000 },
      reason: "DT: streaming fails while HTTP works: bounded polling",
    },
    {
      from: state({ status: "fallback", streamFailures: 4 }),
      event: "stream_failed",
      status: "fallback",
      effects: { openStreamInMs: 60000 },
      reason: "DT: polling, a restore attempt fails: keep polling",
    },
    {
      from: state({ status: "fallback", streamFailures: 3 }),
      event: "poll_failed",
      status: "offline",
      effects: { pollInMs: 5000 },
      reason: "DT: HTTP fails too: offline, back off from 5 s",
    },
    {
      from: state({ status: "offline", streamFailures: 3, pollFailures: 4 }),
      event: "poll_failed",
      status: "offline",
      effects: { pollInMs: 60000 },
      reason: "BVA: fifth poll failure reaches the 60 s cap",
    },
    {
      from: state({ status: "offline", streamFailures: 3, pollFailures: 9 }),
      event: "poll_failed",
      status: "offline",
      effects: { pollInMs: 60000 },
      reason: "BVA: later failures stay at the cap",
    },
    {
      from: state({ status: "offline", streamFailures: 3, pollFailures: 2 }),
      event: "poll_succeeded",
      status: "fallback",
      effects: { reload: true, pollInMs: 15000 },
      reason: "DT: offline, HTTP works again: reconcile and poll",
    },
    {
      from: state({ status: "live" }),
      event: "focused",
      status: "live",
      effects: { reload: true },
      reason: "DT: live, the screen regains focus: reconcile",
    },
    {
      from: state({ status: "offline", streamFailures: 3, pollFailures: 5 }),
      event: "focused",
      status: "offline",
      effects: { pollInMs: 0, openStreamInMs: 0 },
      reason: "DT: offline, focus or manual refresh: try both transports now",
    },
    {
      from: state({ status: "fallback", streamFailures: 3 }),
      event: "poll_succeeded",
      status: "fallback",
      effects: { reload: true, pollInMs: 15000 },
      reason: "DT: polling, a poll succeeds: read fresh Orders, poll again",
    },
    {
      from: state({ status: "live" }),
      event: "poll_failed",
      status: "live",
      effects: {},
      reason: "DT: a late poll result after streaming was restored is ignored",
    },
    {
      from: state({ status: "live" }),
      event: "reconcile_due",
      status: "live",
      effects: { reload: true },
      reason: "DT: live, the periodic reconciliation is due",
    },
  ]

  for (const { from, event, status, effects, reason } of cases)
    it(reason, () => {
      const next = nextConnection(from, event)
      assert.equal(next.state.status, status)
      assert.deepEqual(next.effects, effects)
    })

  it("counts failures until the reopened feed proves it stays open", () => {
    let current = INITIAL_CONNECTION
    for (const event of [
      "stream_failed",
      "stream_failed",
      "stream_failed",
      "poll_failed",
      "poll_succeeded",
      "stream_ready",
      "heartbeat_received",
    ] as ConnectionEvent[])
      current = nextConnection(current, event).state
    assert.deepEqual(current, {
      status: "live",
      isStreamUnproven: false,
      streamFailures: 0,
      pollFailures: 0,
    })
  })

  it("backs off and falls back when the feed opens and drops at once", () => {
    let current = INITIAL_CONNECTION
    let effects = {}
    for (const event of [
      "stream_ready",
      "stream_failed",
      "stream_ready",
      "stream_failed",
      "stream_ready",
      "stream_failed",
    ] as ConnectionEvent[])
      ({ state: current, effects } = nextConnection(current, event))
    // It was never proven, so the screen never claimed live in between.
    assert.equal(current.status, "connecting")
    assert.deepEqual(effects, { pollInMs: 0, openStreamInMs: 60000 })
  })

  it("never claims live for a feed that opens and then stays silent", () => {
    let current = nextConnection(INITIAL_CONNECTION, "stream_ready").state
    for (const event of ["reconcile_due", "focused"] as ConnectionEvent[])
      current = nextConnection(current, event).state
    assert.equal(current.status, "connecting")
    assert.equal(
      nextConnection(current, "heartbeat_missed").state.status,
      "connecting",
    )
  })

  it("stays connecting, not reconnecting, while the first feed has never opened", () => {
    assert.equal(
      nextConnection(INITIAL_CONNECTION, "stream_failed").state.status,
      "connecting",
    )
  })
})
