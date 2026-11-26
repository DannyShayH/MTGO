import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shareWithinTick } from "../share-within-tick.ts"

// #252: the header basket and the phone basket bar both read the cart on one
// cart-updated event; they share that one read, but a later event reads again.
describe("shareWithinTick", () => {
  const counted = () => {
    let calls = 0
    const read = shareWithinTick(async () => ++calls)
    return { read, calls: () => calls }
  }

  it("EP: calls made in the same tick share one read", async () => {
    const { read, calls } = counted()
    const [first, second] = await Promise.all([read(), read()])
    assert.equal(calls(), 1)
    assert.equal(first, second)
  })

  it("EP: a call in a later tick reads again, even while the first is in flight", async () => {
    let finish: (value: number) => void = () => {}
    let calls = 0
    const read = shareWithinTick(
      () =>
        new Promise<number>((resolve) => {
          calls++
          finish = resolve
        }),
    )
    void read()
    await new Promise((resolve) => setTimeout(resolve, 0))
    void read()
    assert.equal(calls, 2)
    finish(1)
  })

  it("EP: a failed read is shared by its tick and not by the next one", async () => {
    let calls = 0
    const read = shareWithinTick(async () => {
      calls++
      throw new Error("refused")
    })
    await Promise.allSettled([read(), read()])
    await new Promise((resolve) => setTimeout(resolve, 0))
    await read().catch(() => {})
    assert.equal(calls, 2)
  })
})
