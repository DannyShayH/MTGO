import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  checkOrdersWith,
  relayFeed,
  type FeedMessage,
  type Upstream,
} from "../order-feed-relay.ts"

/** A failed SDK call: `FetchError` carries the backend's status. */
const failure = (status?: number) =>
  Object.assign(new Error("upstream failed"), { status })

/** The `event:` names a relayed body carries, in order. */
const eventsOf = (body: string) =>
  [...body.matchAll(/^event: (.+)$/gm)].map(([, event]) => event)

/** An upstream that yields `messages`, then throws `error` if one is given. */
function upstreamOf(messages: FeedMessage[], error?: unknown) {
  const calls = { opened: [] as string[], aborted: 0 }
  const openUpstream = async (token: string): Promise<Upstream> => {
    calls.opened.push(token)
    return {
      stream: (async function* () {
        yield* messages
        if (error) throw error
      })(),
      abort: () => {
        calls.aborted += 1
      },
    }
  }
  return { openUpstream, calls }
}

const relay = (
  token: string | undefined,
  openUpstream: (token: string) => Promise<Upstream>,
  signal = new AbortController().signal,
) => {
  const failures: unknown[] = []
  const response = relayFeed({
    token,
    openUpstream,
    signal,
    onFailure: (error) => failures.push(error),
  })
  return { response, failures }
}

describe("The kitchen feed relay", () => {
  it("relays the backend events with headers proxies do not buffer", async () => {
    const { openUpstream, calls } = upstreamOf([
      { event: "ready", data: '{"server_time":"t"}' },
      { event: "orders", data: '{"orders":[{"id":"order_1","revision":1}]}' },
    ])
    const { response } = relay("token-1", openUpstream)
    assert.equal(
      response.headers.get("content-type"),
      "text/event-stream; charset=utf-8",
    )
    assert.match(response.headers.get("cache-control") ?? "", /no-transform/)
    const body = await response.text()
    assert.deepEqual(eventsOf(body), ["ready", "orders"])
    assert.match(body, /"order_1"/)
    // The cookie's token is passed per call, and the stream is cleaned up.
    assert.deepEqual(calls.opened, ["token-1"])
    assert.equal(calls.aborted, 1)
  })

  it("ends the session without calling the backend when the cookie is gone", async () => {
    const { openUpstream, calls } = upstreamOf([])
    const body = await relay(undefined, openUpstream).response.text()
    assert.deepEqual(eventsOf(body), ["ended"])
    assert.match(body, /"signed_out"/)
    assert.deepEqual(calls.opened, [])
  })

  for (const { status, code, reason } of [
    { status: 403, code: "staff_access_revoked", reason: "DT: access revoked" },
    { status: 401, code: "session_expired", reason: "DT: token expired" },
  ])
    it(`turns a refused feed into an ended event: ${reason}`, async () => {
      const { openUpstream } = upstreamOf([], failure(status))
      const { response, failures } = relay("token", openUpstream)
      const body = await response.text()
      assert.deepEqual(eventsOf(body), ["ended"])
      assert.match(body, new RegExp(`"${code}"`))
      assert.equal(failures.length, 0)
    })

  for (const { error, reason } of [
    { error: failure(502), reason: "EP: the backend answers with an error" },
    { error: new TypeError("fetch failed"), reason: "EP: the backend is down" },
  ])
    it(`closes without ending the session so the screen reconnects or polls: ${reason}`, async () => {
      const { openUpstream } = upstreamOf([], error)
      const { response, failures } = relay("token", openUpstream)
      assert.deepEqual(eventsOf(await response.text()), [])
      assert.deepEqual(failures, [error])
    })

  it("closes without ending the session when the backend drops mid-stream", async () => {
    const { openUpstream, calls } = upstreamOf(
      [{ event: "ready", data: "{}" }],
      new TypeError("terminated"),
    )
    const { response } = relay("token", openUpstream)
    assert.deepEqual(eventsOf(await response.text()), ["ready"])
    assert.equal(calls.aborted, 1)
  })

  it("aborts the backend stream when the browser disconnects", async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let aborted = 0
    const openUpstream = async (): Promise<Upstream> => ({
      stream: (async function* () {
        yield { event: "ready", data: "{}" }
        await held
      })(),
      abort: () => {
        aborted += 1
        release()
      },
    })
    const browser = new AbortController()
    const { response } = relay("token", openUpstream, browser.signal)
    const reader = response.body!.getReader()
    await reader.read()
    browser.abort()
    await reader.cancel()
    assert.ok(aborted >= 1)
  })
})

describe("The kitchen screen's polling check", () => {
  const check = (
    token: string | undefined,
    readQueue: (token: string) => Promise<{ server_time: string }>,
  ) => {
    const failures: unknown[] = []
    return checkOrdersWith({
      token,
      readQueue,
      onFailure: (error) => failures.push(error),
    }).then((result) => ({ result, failures }))
  }

  it("is ok when the authorized Orders read works", async () => {
    const { result } = await check("token", async () => ({ server_time: "t" }))
    assert.deepEqual(result, { status: "ok", server_time: "t" })
  })

  it("ends the session when the cookie is gone", async () => {
    const { result } = await check(undefined, async () => {
      throw new Error("not called")
    })
    assert.deepEqual(result, { status: "ended", code: "signed_out" })
  })

  for (const { status, expected, reason } of [
    {
      status: 403,
      expected: { status: "ended", code: "staff_access_revoked" },
      reason: "DT: access revoked",
    },
    {
      status: 401,
      expected: { status: "ended", code: "session_expired" },
      reason: "DT: token expired",
    },
    {
      status: 502,
      expected: { status: "unavailable" },
      reason: "DT: the backend fails",
    },
  ])
    it(`answers a failed read: ${reason}`, async () => {
      const { result, failures } = await check("token", async () => {
        throw failure(status)
      })
      assert.deepEqual(result, expected)
      assert.equal(failures.length, expected.status === "unavailable" ? 1 : 0)
    })
})
