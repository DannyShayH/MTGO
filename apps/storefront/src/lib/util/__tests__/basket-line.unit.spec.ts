import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { confirmLine, initialLineState, withLineProp } from "../basket-line.ts"

const added = { lineId: "line_1", quantity: 1 }

describe("a dish's basket line on the menu (#203)", () => {
  it("EP: starts from the line the page rendered", () => {
    assert.deepEqual(initialLineState(added), {
      seen: added,
      lineId: "line_1",
      quantity: 1,
      isAhead: false,
    })
    assert.deepEqual(initialLineState(null), {
      seen: null,
      lineId: null,
      quantity: 0,
      isAhead: false,
    })
  })

  it("EP: a stale page that still shows no line keeps the line the server just confirmed", () => {
    // The tap confirmed the line before the revalidated page arrives.
    const confirmed = confirmLine(initialLineState(null), added)
    // The old page renders again with `line` still null: no return to the pill.
    const rerendered = withLineProp(confirmed, null)
    assert.equal(rerendered, confirmed)
    assert.equal(rerendered.lineId, "line_1")
  })

  it("EP: the refreshed page's line is taken once it arrives, without a change on screen", () => {
    const confirmed = confirmLine(initialLineState(null), added)
    const refreshed = withLineProp(confirmed, { ...added })
    assert.deepEqual(
      { lineId: refreshed.lineId, quantity: refreshed.quantity },
      { lineId: "line_1", quantity: 1 },
    )
    // And from then on the same line is no change.
    assert.equal(withLineProp(refreshed, { ...added }), refreshed)
  })

  it("EP: a late page from the add never undoes a step made after it", () => {
    // Add confirms 1, then + confirms 2 before the add's page arrives.
    let state = confirmLine(initialLineState(null), added)
    state = confirmLine(state, { lineId: "line_1", quantity: 2 })
    state = withLineProp(state, { lineId: "line_1", quantity: 1 })
    assert.equal(state.quantity, 2)
    // The page that holds the step catches up without a change on screen.
    state = withLineProp(state, { lineId: "line_1", quantity: 2 })
    assert.equal(state.quantity, 2)
    // From then on the page leads again.
    assert.equal(
      withLineProp(state, { lineId: "line_1", quantity: 5 }).quantity,
      5,
    )
  })

  it("EP: a line changed elsewhere (another tab, the basket page) still reaches the menu", () => {
    const shown = initialLineState(added)
    const changed = withLineProp(shown, { lineId: "line_1", quantity: 3 })
    assert.equal(changed.quantity, 3)
    assert.equal(withLineProp(changed, null).lineId, null)
  })

  it("EP: removing the line in the stepper goes back to the pill", () => {
    const removed = confirmLine(initialLineState(added), {
      lineId: null,
      quantity: 0,
    })
    assert.deepEqual(
      { lineId: removed.lineId, quantity: removed.quantity },
      { lineId: null, quantity: 0 },
    )
  })
})
