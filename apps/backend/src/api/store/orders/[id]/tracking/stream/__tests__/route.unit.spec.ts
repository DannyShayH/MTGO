import { EventEmitter } from "node:events"
import { MedusaError } from "@medusajs/framework/utils"

const read = jest.fn()
const hasIdentity = jest.fn()
const shutdownEnds: Array<() => void> = []

jest.mock("../../../../../../../workflows/order-operations", () => ({
  readCustomerTrackingFeedWorkflow: () => ({ run: read }),
}))
jest.mock("../../../../../../customer-identity", () => ({
  hasIsolatedCustomerIdentity: () => hasIdentity(),
}))
jest.mock("../../../../../../event-stream", () => ({
  ...jest.requireActual("../../../../../../event-stream"),
  endFeedOnShutdown: (end: () => void) => {
    shutdownEnds.push(end)
    return () => {}
  },
}))

import { GET } from "../route"

const RECHECK_MS = 2000

/** A promise the test settles by hand, to close the feed mid-call. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const token = (change_token: string) => ({
  result: { change_token, server_time: new Date().toISOString() },
})

/** Opens the feed on a fake connection and records what it writes. */
async function openFeed(expiresAt?: number) {
  const log = jest.fn()
  const req = Object.assign(new EventEmitter(), {
    params: { id: "order_1" },
    auth_context: { actor_id: "cus_1" },
    headers: {},
    scope: { resolve: () => ({ log }) },
  })
  const events: Array<{ event: string; data: unknown; at: number }> = []
  const res = {
    locals: { session_expires_at: expiresAt },
    writeHead: jest.fn(),
    write: (chunk: string) => {
      const [, event, data] = /^event: (\w+)\ndata: (.*)\n\n$/.exec(chunk)!
      events.push({ event, data: JSON.parse(data), at: Date.now() })
    },
    end: jest.fn(),
  }
  await GET(req as never, res as never)
  const names = () => events.map(({ event }) => event)
  return { req, res, events, names, log }
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 })
  read.mockReset().mockResolvedValue(token("a"))
  hasIdentity.mockReset().mockResolvedValue(true)
  shutdownEnds.length = 0
})

afterEach(() => {
  jest.useRealTimers()
})

it("keeps quiet heartbeats within fifteen seconds", async () => {
  const { events } = await openFeed()

  await jest.advanceTimersByTimeAsync(60_000)

  const writes = events.map(({ at }) => at)
  const gaps = writes.slice(1).map((at, i) => at - writes[i])
  expect(events[0].event).toBe("ready")
  expect(events.slice(1).every(({ event }) => event === "heartbeat")).toBe(true)
  expect(Math.max(...gaps)).toBeLessThanOrEqual(15_000)
})

it("sends a change hint carrying only the change token", async () => {
  const { events } = await openFeed()
  read.mockResolvedValue(token("b"))

  await jest.advanceTimersByTimeAsync(RECHECK_MS)

  expect(events.at(-1)).toEqual({
    event: "tracking",
    data: { change_token: "b" },
    at: RECHECK_MS,
  })
})

it("ends the feed once the session expires", async () => {
  const { names, res } = await openFeed(RECHECK_MS)

  await jest.advanceTimersByTimeAsync(RECHECK_MS)

  expect(names()).toEqual(["ready", "ended"])
  expect(res.end).toHaveBeenCalledTimes(1)
})

it.each([
  {
    reason: "DT: the sign-in check fails while the feed is open",
    arrange: () => hasIdentity.mockResolvedValue(false),
    code: "sign_in_required",
  },
  {
    reason: "DT: the Order is no longer readable by this Customer",
    arrange: () =>
      read.mockRejectedValue(
        new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found"),
      ),
    code: "order_unavailable",
  },
])("ends the feed with a reason: $reason", async ({ arrange, code }) => {
  const { events, res } = await openFeed()
  arrange()

  await jest.advanceTimersByTimeAsync(RECHECK_MS)

  expect(events.at(-1)?.data).toEqual({ code })
  expect(res.end).toHaveBeenCalledTimes(1)
})

it("closes without a reason and logs it when the durable read fails", async () => {
  const { names, res, log } = await openFeed()
  read.mockRejectedValue(new Error("database unavailable"))

  await jest.advanceTimersByTimeAsync(RECHECK_MS)

  expect(names()).toEqual(["ready"])
  expect(res.end).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledTimes(1)
})

it("closes without a reason on process shutdown, so the page reconnects or polls", async () => {
  const { names, res } = await openFeed()

  shutdownEnds.forEach((end) => end())
  await jest.advanceTimersByTimeAsync(RECHECK_MS * 3)

  expect(names()).toEqual(["ready"])
  expect(res.end).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
})

it.each([
  {
    reason: "EP: closed during the sign-in check, which then fails",
    settle: () => {
      const check = deferred<boolean>()
      hasIdentity.mockReturnValue(check.promise)
      return () => check.resolve(false)
    },
  },
  {
    reason: "EP: closed during a read that then finds a change",
    settle: () => {
      const pending = deferred<ReturnType<typeof token>>()
      read.mockReturnValue(pending.promise)
      return () => pending.resolve(token("b"))
    },
  },
  {
    reason: "EP: closed during a read that then fails",
    settle: () => {
      const pending = deferred<ReturnType<typeof token>>()
      read.mockReturnValue(pending.promise)
      return () => pending.reject(new Error("database unavailable"))
    },
  },
])(
  "writes nothing after the browser disconnects: $reason",
  async ({ settle }) => {
    const { req, res, names, log } = await openFeed()
    const finish = settle()

    await jest.advanceTimersByTimeAsync(RECHECK_MS)
    req.emit("close")
    finish()
    await jest.advanceTimersByTimeAsync(RECHECK_MS * 3)

    expect(names()).toEqual(["ready"])
    expect(res.end).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  },
)
