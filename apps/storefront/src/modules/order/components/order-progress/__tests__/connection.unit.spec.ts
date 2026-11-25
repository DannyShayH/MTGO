import assert from "node:assert/strict"
import { test } from "node:test"
import {
  INITIAL_TRACKING_CONNECTION,
  nextTrackingConnection,
  type TrackingConnection,
  type TrackingConnectionEvent,
} from "../connection.ts"

const run = (
  events: TrackingConnectionEvent[],
  from = INITIAL_TRACKING_CONNECTION,
) => {
  let state: TrackingConnection = from
  const rereads: number[] = []
  events.forEach((event, index) => {
    const next = nextTrackingConnection(state, event)
    state = next.state
    if (next.shouldReread) rereads.push(index)
  })
  return { state, rereads }
}

test("readiness alone is not live: it asks for a reread first", () => {
  const { state, rereads } = run([{ type: "stream_ready", nextRead: 1 }])
  assert.equal(state.status, "connecting")
  assert.deepEqual(rereads, [0])
})

test("live needs both a successful reread after ready and feed activity, in either order", () => {
  const readThenBeat = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "read_succeeded", read: 1 },
    { type: "heartbeat" },
  ])
  assert.equal(readThenBeat.state.status, "live")

  const beatThenRead = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "heartbeat" },
  ])
  assert.equal(beatThenRead.state.status, "connecting")
  assert.equal(
    run([{ type: "read_succeeded", read: 1 }], beatThenRead.state).state.status,
    "live",
  )
})

test("a read that started before ready does not prove reconciliation", () => {
  const { state } = run([
    { type: "stream_ready", nextRead: 4 },
    { type: "read_succeeded", read: 3 },
    { type: "heartbeat" },
  ])
  assert.equal(state.status, "connecting")
})

test("a failed reread keeps the page from claiming live", () => {
  const { state } = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "heartbeat" },
    { type: "heartbeat" },
  ])
  assert.equal(state.status, "connecting")
})

test("feed activity before ready is ignored", () => {
  const { state } = run([
    { type: "heartbeat" },
    { type: "read_succeeded", read: 1 },
  ])
  assert.equal(state.status, "connecting")
})

test("every tracking hint rereads and counts as feed activity", () => {
  const { state, rereads } = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "read_succeeded", read: 1 },
    { type: "tracking_hinted" },
    { type: "tracking_hinted" },
  ])
  assert.equal(state.status, "live")
  assert.deepEqual(rereads, [0, 2, 3])
})

test("a stream failure switches to checking at once, from connecting or live, and rereads", () => {
  const early = run([{ type: "stream_failed" }])
  assert.equal(early.state.status, "checking")
  assert.deepEqual(early.rereads, [0])

  const live = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "read_succeeded", read: 1 },
    { type: "heartbeat" },
    { type: "stream_failed" },
    // Late activity of the dropped stream proves nothing.
    { type: "heartbeat" },
  ])
  assert.equal(live.state.status, "checking")
})

test("while checking, a reopened stream becomes live only after proving itself again", () => {
  const checking = run([{ type: "stream_failed" }]).state
  const ready = run([{ type: "stream_ready", nextRead: 7 }], checking).state
  assert.equal(ready.status, "checking")
  const proven = run(
    [{ type: "read_succeeded", read: 7 }, { type: "heartbeat" }],
    ready,
  ).state
  assert.equal(proven.status, "live")
})

test("a live page rereads when a reconciliation is due; otherwise not", () => {
  const live = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "read_succeeded", read: 1 },
    { type: "heartbeat" },
  ]).state
  assert.equal(
    nextTrackingConnection(live, { type: "reconcile_due" }).shouldReread,
    true,
  )
  assert.equal(
    nextTrackingConnection(INITIAL_TRACKING_CONNECTION, {
      type: "reconcile_due",
    }).shouldReread,
    false,
  )
})

test("a failed reconciliation switches to checking, and a later read after ready can still prove the feed", () => {
  const failed = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "heartbeat" },
    { type: "read_failed", read: 1 },
  ]).state
  assert.equal(failed.status, "checking")
  const recovered = run(
    [{ type: "read_succeeded", read: 2 }, { type: "heartbeat" }],
    failed,
  ).state
  assert.equal(recovered.status, "live")
})

test("a live page whose reread fails stops claiming live until it proves itself again", () => {
  const live = run([
    { type: "stream_ready", nextRead: 1 },
    { type: "read_succeeded", read: 1 },
    { type: "heartbeat" },
  ]).state
  const failed = run([{ type: "read_failed", read: 2 }], live).state
  assert.equal(failed.status, "checking")
  // An older read finishing late proves nothing.
  assert.equal(
    run([{ type: "read_succeeded", read: 2 }, { type: "heartbeat" }], failed)
      .state.status,
    "checking",
  )
  assert.equal(
    run([{ type: "read_succeeded", read: 3 }, { type: "heartbeat" }], failed)
      .state.status,
    "live",
  )
})

test("a failed read without an open feed changes nothing", () => {
  const checking = run([{ type: "stream_failed" }]).state
  const { state, rereads } = run([{ type: "read_failed", read: 5 }], checking)
  assert.deepEqual(state, checking)
  assert.deepEqual(rereads, [])
})
