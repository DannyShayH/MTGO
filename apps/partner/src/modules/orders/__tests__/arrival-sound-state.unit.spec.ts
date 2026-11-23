import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  initialSound,
  isRemembered,
  isSwitchOn,
  nextSound,
  type Sound,
} from "../arrival-sound-state.ts"

describe("the remembered sound choice", () => {
  it("EP: a staff member who never chose sound starts with it off", () => {
    assert.equal(initialSound(false), "off")
  })

  it("EP: a remembered choice starts on, waiting for the browser to allow sound", () => {
    const sound = initialSound(true)
    assert.equal(sound, "waiting")
    // The switch shows the choice, not the browser's permission.
    assert.equal(isSwitchOn(sound), true)
    assert.equal(isRemembered(sound), true)
  })

  it("EP: the first click or tap on the page lets the waiting sound play", () => {
    assert.equal(nextSound("waiting", { type: "unlocked" }), "on")
  })

  it("EP: unlocking never turns on a sound staff switched off", () => {
    assert.equal(nextSound("off", { type: "unlocked" }), "off")
    assert.equal(nextSound("blocked", { type: "unlocked" }), "blocked")
  })
})

describe("switching sound on and off", () => {
  it("EP: switching on remembers it once the test tone played", () => {
    const sound = nextSound("off", { type: "switched_on", isPlayed: true })
    assert.equal(sound, "on")
    assert.equal(isRemembered(sound), true)
  })

  it("EP: a browser that refuses the test tone leaves the switch off and forgets nothing new", () => {
    const sound = nextSound("off", { type: "switched_on", isPlayed: false })
    assert.equal(sound, "blocked")
    assert.equal(isSwitchOn(sound), false)
    assert.equal(isRemembered(sound), false)
  })

  it("EP: switching off forgets the choice from any state", () => {
    for (const sound of ["on", "waiting", "blocked"] as Sound[])
      assert.equal(
        isRemembered(nextSound(sound, { type: "switched_off" })),
        false,
      )
  })
})

describe("an arrival tone the browser did not play", () => {
  it("EP: keeps the staff member's choice and waits for the next click or tap", () => {
    assert.equal(nextSound("on", { type: "play_failed" }), "waiting")
    assert.equal(nextSound("waiting", { type: "play_failed" }), "waiting")
  })
})
