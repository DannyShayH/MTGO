import assert from "node:assert/strict"
import { test } from "node:test"
import {
  relayTrackingFeed,
  type TrackingFeedMessage,
} from "../tracking-feed-relay.ts"

const upstreamOf = (
  messages: TrackingFeedMessage[],
  onAbort: () => void = () => {},
) => ({
  stream: (async function* () {
    yield* messages
  })(),
  abort: onAbort,
})

const relayed = async (response: Response) => await response.text()

/** A refused SDK stream: `FetchError` carries the backend's status. */
const failure = (status: number) =>
  Object.assign(new Error("upstream failed"), { status })

test("relays the feed's events as a same-origin, unbuffered event stream", async () => {
  let usedToken: string | undefined
  const response = relayTrackingFeed({
    token: "customer-token",
    openUpstream: async (token) => {
      usedToken = token
      return upstreamOf([
        { event: "ready", data: '{"server_time":"t"}' },
        { event: "heartbeat", data: '{"server_time":"t"}' },
        { event: "tracking", data: '{"change_token":"abc"}' },
      ])
    },
    signal: new AbortController().signal,
    onFailure: () => assert.fail("no failure expected"),
  })
  assert.equal(usedToken, "customer-token")
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/)
  assert.match(response.headers.get("cache-control") ?? "", /no-transform/)
  assert.equal(response.headers.get("x-accel-buffering"), "no")
  assert.equal(
    await relayed(response),
    'event: ready\ndata: {"server_time":"t"}\n\n' +
      'event: heartbeat\ndata: {"server_time":"t"}\n\n' +
      'event: tracking\ndata: {"change_token":"abc"}\n\n',
  )
})

test("passes on only the feed's own events", async () => {
  const response = relayTrackingFeed({
    token: "customer-token",
    openUpstream: async () =>
      upstreamOf([
        { event: "ready", data: "{}" },
        { event: "surprise", data: '{"latitude":55.68}' },
        { data: "no event name" },
      ]),
    signal: new AbortController().signal,
    onFailure: () => {},
  })
  assert.equal(await relayed(response), "event: ready\ndata: {}\n\n")
})

test("a signed-out visitor gets an ended event without reaching the backend", async () => {
  const response = relayTrackingFeed({
    token: undefined,
    openUpstream: async () => assert.fail("must not open"),
    signal: new AbortController().signal,
    onFailure: () => {},
  })
  assert.equal(
    await relayed(response),
    'event: ended\ndata: {"code":"signed_out"}\n\n',
  )
})

for (const { status, code, reason } of [
  { status: 401, code: "sign_in_required", reason: "DT: session refused" },
  { status: 403, code: "sign_in_required", reason: "DT: access forbidden" },
  {
    status: 404,
    code: "order_unavailable",
    reason: "DT: unknown or other Customer's Order, one answer for both",
  },
] as const) {
  test(`a refused feed becomes an ended event: ${reason}`, async () => {
    const failures: unknown[] = []
    const response = relayTrackingFeed({
      token: "customer-token",
      openUpstream: async () => ({
        stream: (async function* () {
          throw failure(status)
        })() as AsyncIterable<TrackingFeedMessage>,
        abort: () => {},
      }),
      signal: new AbortController().signal,
      onFailure: (error) => failures.push(error),
    })
    assert.equal(
      await relayed(response),
      `event: ended\ndata: {"code":"${code}"}\n\n`,
    )
    assert.deepEqual(failures, [])
  })
}

test("any other failure closes silently and is reported, so the page falls back", async () => {
  const failures: unknown[] = []
  const response = relayTrackingFeed({
    token: "customer-token",
    openUpstream: async () => {
      throw failure(503)
    },
    signal: new AbortController().signal,
    onFailure: (error) => failures.push(error),
  })
  assert.equal(await relayed(response), "")
  assert.equal(failures.length, 1)
})

test("closing the browser connection aborts the backend stream", async () => {
  const browser = new AbortController()
  let aborted = 0
  let release!: () => void
  const response = relayTrackingFeed({
    token: "customer-token",
    openUpstream: async () => ({
      stream: (async function* () {
        yield { event: "ready", data: "{}" }
        await new Promise<void>((resolve) => {
          release = resolve
        })
      })(),
      abort: () => {
        aborted++
        release?.()
      },
    }),
    signal: browser.signal,
    onFailure: () => assert.fail("a disconnect is not a failure"),
  })
  const reader = response.body!.getReader()
  await reader.read()
  browser.abort()
  assert.ok(aborted >= 1)
  await reader.cancel()
})
