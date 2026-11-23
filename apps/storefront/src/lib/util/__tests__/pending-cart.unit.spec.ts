import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  NO_PENDING,
  applyCartChange,
  cartLoaded,
  loadToken,
  withPending,
  type PendingCart,
} from "../pending-cart.ts"

const one = { count: 1, total: 95 }
const loaded = { count: 2, total: 190 }

const begin = (state: PendingCart, id: string, delta = one) =>
  applyCartChange(state, { type: "begin", id, delta })

describe("basket counts at the tap (#203)", () => {
  it("EP: a tapped dish counts at once, before the server answers", () => {
    assert.deepEqual(withPending(loaded, begin(NO_PENDING, "a")), {
      count: 3,
      total: 285,
    })
  })

  it("EP: a failed add takes its count back", () => {
    const failed = applyCartChange(begin(NO_PENDING, "a"), {
      type: "fail",
      id: "a",
    })
    assert.deepEqual(withPending(loaded, failed), loaded)
  })

  it("EP: a confirmed add keeps counting until a cart read made after it arrives", () => {
    const settled = applyCartChange(begin(NO_PENDING, "a"), {
      type: "settle",
      id: "a",
    })
    assert.deepEqual(withPending(loaded, settled).count, 3)
    const token = loadToken(settled)
    // The new cart already holds the line, so the pending count goes.
    assert.deepEqual(
      withPending({ count: 3, total: 285 }, cartLoaded(settled, token)),
      {
        count: 3,
        total: 285,
      },
    )
  })

  it("BVA: a cart read started before the server confirmed never drops the count", () => {
    const pending = begin(NO_PENDING, "a")
    const early = loadToken(pending)
    const settled = applyCartChange(pending, { type: "settle", id: "a" })
    // The early read did not see the line yet.
    assert.equal(withPending(loaded, cartLoaded(settled, early)).count, 3)
  })

  it("EP: two quick adds stay counted until each one's own read", () => {
    let state = begin(begin(NO_PENDING, "a"), "b")
    state = applyCartChange(state, { type: "settle", id: "a" })
    const afterA = loadToken(state)
    state = applyCartChange(state, { type: "settle", id: "b" })
    // The read after A holds A but not B.
    state = cartLoaded(state, afterA)
    assert.equal(withPending({ count: 3, total: 285 }, state).count, 4)
    state = cartLoaded(state, loadToken(state))
    assert.equal(withPending({ count: 4, total: 380 }, state).count, 4)
  })

  it("BVA: a removal never shows fewer than zero items", () => {
    const removing = begin(NO_PENDING, "a", { count: -3, total: -285 })
    assert.deepEqual(withPending({ count: 1, total: 95 }, removing), {
      count: 0,
      total: 0,
    })
  })

  it("EP: totals add up in øre, so kroner never pick up floating point dust", () => {
    const state = begin(NO_PENDING, "a", { count: 1, total: 0.1 })
    assert.equal(withPending({ count: 1, total: 0.2 }, state).total, 0.3)
  })

  it("EP: an unknown change leaves the state alone", () => {
    assert.equal(
      applyCartChange(NO_PENDING, { type: "settle", id: "missing" }),
      NO_PENDING,
    )
  })
})
