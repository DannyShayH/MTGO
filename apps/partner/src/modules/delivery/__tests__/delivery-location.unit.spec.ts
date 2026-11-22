import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createTransitUploader,
  needsFreshPosition,
  REFRESH_AFTER_MS,
  shouldUpload,
  UPLOAD_EVERY_MS,
  type UploadState,
} from "../delivery-location.ts"

const NOW = 1_000_000_000
const sample = (observedAgoMs: number) => ({
  latitude: 55.68,
  longitude: 12.57,
  accuracy_m: 20,
  observed_at: NOW - observedAgoMs,
})
const ready = (overrides: Partial<UploadState> = {}): UploadState => ({
  latest: sample(1_000),
  sent: null,
  isInFlight: false,
  isVisible: true,
  isOnline: true,
  ...overrides,
})

describe("shouldUpload", () => {
  it("bounds uploads to fifteen seconds", () => {
    assert.equal(UPLOAD_EVERY_MS, 15_000)
  })

  const rows: { reason: string; state: Partial<UploadState>; send: boolean }[] =
    [
      { reason: "DT: the first position goes at once", state: {}, send: true },
      {
        reason: "DT: nothing to send without a position",
        state: { latest: null },
        send: false,
      },
      {
        reason: "DT: nothing goes while the page is hidden",
        state: { isVisible: false },
        send: false,
      },
      {
        reason: "DT: nothing queues while offline",
        state: { isOnline: false },
        send: false,
      },
      {
        reason: "DT: one request at a time",
        state: { isInFlight: true },
        send: false,
      },
      {
        reason:
          "BVA: a newer position waits until fifteen seconds after the last send",
        state: { sent: { observed_at: NOW - 20_000, at: NOW - 14_999 } },
        send: false,
      },
      {
        reason:
          "BVA: a newer position goes exactly fifteen seconds after the last send",
        state: { sent: { observed_at: NOW - 20_000, at: NOW - 15_000 } },
        send: true,
      },
      {
        reason:
          "EP: the same observation never goes twice, so a standing phone does not look fresher",
        state: { sent: { observed_at: NOW - 1_000, at: NOW - 60_000 } },
        send: false,
      },
    ]
  for (const { reason, state, send } of rows)
    it(reason, () => assert.equal(shouldUpload(ready(state), NOW), send))
})

describe("needsFreshPosition", () => {
  const rows: { reason: string; observedAgoMs: number | null; ask: boolean }[] =
    [
      {
        reason: "EP: asks when there is no position yet",
        observedAgoMs: null,
        ask: true,
      },
      {
        reason: "BVA: waits 1 ms before thirty seconds",
        observedAgoMs: REFRESH_AFTER_MS - 1,
        ask: false,
      },
      {
        reason: "BVA: asks again at exactly thirty seconds",
        observedAgoMs: REFRESH_AFTER_MS,
        ask: true,
      },
    ]
  for (const { reason, observedAgoMs, ask } of rows)
    it(reason, () =>
      assert.equal(
        needsFreshPosition(
          observedAgoMs === null ? null : sample(observedAgoMs),
          NOW,
        ),
        ask,
      ),
    )
})

describe("createTransitUploader", () => {
  type Outcome = Awaited<
    ReturnType<Parameters<typeof createTransitUploader>[0]["send"]>
  >
  const harness = (answer: Outcome, isOnline = true) => {
    let clock = NOW
    const sent: number[] = []
    const reports: unknown[] = []
    let ended = 0
    const uploader = createTransitUploader({
      send: async (position) => {
        sent.push(position.observed_at)
        return answer
      },
      report: (state) => reports.push(state),
      onEnded: () => (ended += 1),
      environment: () => ({ isVisible: true, isOnline }),
      now: () => clock,
    })
    return {
      uploader,
      sent,
      reports,
      ended: () => ended,
      advance: (ms: number) => (clock += ms),
    }
  }

  it("sends the first position, keeps only the newest meanwhile and sends it when due", async () => {
    const h = harness({ status: "shared", observed_at: "2026-11-22T12:00:00Z" })
    await h.uploader.offer(sample(3_000))
    await h.uploader.offer(sample(2_000))
    await h.uploader.offer(sample(1_000))
    assert.deepEqual(h.sent, [NOW - 3_000])
    h.advance(UPLOAD_EVERY_MS)
    await h.uploader.flush()
    // Only the newest of the waiting positions goes; nothing queued.
    assert.deepEqual(h.sent, [NOW - 3_000, NOW - 1_000])
    assert.deepEqual(h.reports.at(-1), {
      phase: "shared",
      observed_at: "2026-11-22T12:00:00Z",
    })
  })

  it("never takes an older position over a newer one", async () => {
    const h = harness({ status: "shared", observed_at: null })
    await h.uploader.offer(sample(1_000))
    await h.uploader.offer(sample(5_000))
    assert.equal(h.uploader.latest()?.observed_at, NOW - 1_000)
  })

  const rows: { reason: string; answer: Outcome; phase: string | null }[] = [
    {
      reason: "EP: a failed send is retried and says so",
      answer: { status: "unavailable" },
      phase: "failed",
    },
    {
      reason: "EP: a refused sample is not sent again",
      answer: { status: "refused" },
      phase: null,
    },
  ]
  for (const { reason, answer, phase } of rows)
    it(reason, async () => {
      const h = harness(answer)
      await h.uploader.offer(sample(1_000))
      assert.deepEqual(h.reports.at(-1) ?? null, phase && { phase })
      h.advance(UPLOAD_EVERY_MS)
      await h.uploader.flush()
      assert.equal(h.sent.length, answer.status === "unavailable" ? 2 : 1)
    })

  it("stops for good once the delivery ended", async () => {
    const h = harness({ status: "ended" })
    await h.uploader.offer(sample(2_000))
    assert.equal(h.ended(), 1)
    h.advance(UPLOAD_EVERY_MS)
    await h.uploader.offer(sample(1_000))
    assert.equal(h.sent.length, 1)
  })

  it("after a pause sends the phone's next measurement, not one buffered before it", async () => {
    let isVisible = true
    let clock = NOW
    const sent: number[] = []
    const uploader = createTransitUploader({
      send: async (position) => {
        sent.push(position.observed_at)
        return { status: "shared", observed_at: null }
      },
      report: () => {},
      onEnded: () => {},
      environment: () => ({ isVisible, isOnline: true }),
      now: () => clock,
    })
    await uploader.offer(sample(120_000))
    // A position measured just before the call or lock is waiting to be sent.
    await uploader.offer(sample(90_000))
    isVisible = false
    uploader.suspend()
    clock += 60_000
    isVisible = true
    await uploader.flush()
    assert.deepEqual(sent, [NOW - 120_000])
    const fresh = { ...sample(0), observed_at: clock - 1_000 }
    await uploader.offer(fresh)
    assert.deepEqual(sent, [NOW - 120_000, clock - 1_000])
  })

  it("reports offline and sends nothing while offline", async () => {
    const h = harness({ status: "shared", observed_at: null }, false)
    await h.uploader.offer(sample(1_000))
    assert.deepEqual(h.sent, [])
    assert.deepEqual(h.reports, [{ phase: "offline" }])
  })
})
