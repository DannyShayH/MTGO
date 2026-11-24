import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { isSettled, serializeRefresh, startPolling } from "../polling.ts"

test("visible checks use a ten-second cadence and stop on cleanup", () => {
  mock.timers.enable({ apis: ["setInterval"] })
  try {
    let visible = true
    let reads = 0
    const stop = startPolling(
      () => visible,
      () => reads++,
    )
    mock.timers.tick(9_999)
    assert.equal(reads, 0)
    mock.timers.tick(1)
    assert.equal(reads, 1)
    visible = false
    mock.timers.tick(10_000)
    assert.equal(reads, 1)
    visible = true
    mock.timers.tick(10_000)
    assert.equal(reads, 2)
    stop()
    mock.timers.tick(10_000)
    assert.equal(reads, 2)
  } finally {
    mock.timers.reset()
  }
})

test("slow reads never overlap and a return is reconciled once", async () => {
  let finish!: (value: boolean) => void
  let reads = 0
  const refresh = serializeRefresh(() => {
    reads++
    return new Promise<boolean>((resolve) => {
      finish = resolve
    })
  })
  const first = refresh(true)
  const skipped = refresh(true)
  const returned = refresh(false)
  const returnedAgain = refresh(false)
  assert.equal(reads, 1)
  finish(true)
  await Promise.resolve()
  assert.equal(reads, 2)
  finish(true)
  await Promise.all([first, skipped, returned, returnedAgain])
})

test("a refusal prevents a queued return from reading again", async () => {
  let finish!: (value: boolean) => void
  let reads = 0
  const refresh = serializeRefresh(() => {
    reads++
    return new Promise<boolean>((resolve) => {
      finish = resolve
    })
  })
  const first = refresh(true)
  const returned = refresh(false)
  finish(false)
  await Promise.all([first, returned])
  assert.equal(reads, 1)
})

test("a failed read releases the lock for the next check", async () => {
  let reads = 0
  const refresh = serializeRefresh(async () => {
    reads++
    if (reads === 1) throw new Error("unavailable")
    return true
  })
  await assert.rejects(refresh(true), /unavailable/)
  await refresh(true)
  assert.equal(reads, 2)
})

test("only a terminal outcome with settled follow-up stops checks", () => {
  const cases = [
    { state: "ready", outcome: null, followUp: "settled", expected: false },
    { state: "cancelled", outcome: null, followUp: "pending", expected: false },
    { state: "cancelled", outcome: null, followUp: "unknown", expected: false },
    { state: "cancelled", outcome: null, followUp: "settled", expected: true },
    {
      state: "ready",
      outcome: "delivered",
      followUp: "unknown",
      expected: false,
    },
    {
      state: "ready",
      outcome: "delivered",
      followUp: "settled",
      expected: true,
    },
  ]
  for (const { state, outcome, followUp, expected } of cases) {
    assert.equal(
      isSettled({
        state,
        delivery: { outcome },
        follow_up: { status: followUp },
      }),
      expected,
    )
  }
})
