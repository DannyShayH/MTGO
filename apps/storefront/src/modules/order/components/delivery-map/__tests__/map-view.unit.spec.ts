import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { deliveryMapView } from "../map-view.ts"

const sample = {
  state: "fresh" as const,
  latitude: 55.6761,
  longitude: 12.5683,
  accuracy_m: 12,
  observed_at: "2026-11-24T12:00:00.000Z",
  received_at: "2026-11-24T12:00:01.000Z",
  stale_at: "2026-11-24T12:01:00.000Z",
  revision: 3,
}

describe("delivery map view", () => {
  it("draws the measured position as measured", () => {
    assert.deepEqual(deliveryMapView(sample, false, 0), {
      kind: "position",
      latitude: 55.6761,
      longitude: 12.5683,
      accuracy_m: 12,
      precision: "precise",
      freshness: "fresh",
      revision: 3,
    })
  })

  for (const { location, isEnded, age, expected, reason } of [
    {
      location: null,
      isEnded: false,
      age: null,
      expected: "none",
      reason: "DT R1: no delivery yet (before pickup)",
    },
    {
      location: { ...sample, state: "not_started" as const },
      isEnded: false,
      age: 0,
      expected: "none",
      reason: "DT R2: sharing not started",
    },
    {
      location: {
        ...sample,
        state: "unavailable" as const,
        latitude: null,
        longitude: null,
      },
      isEnded: false,
      age: null,
      expected: "none",
      reason: "DT R3: picked up without a coordinate",
    },
    {
      location: { ...sample, longitude: null },
      isEnded: false,
      age: 0,
      expected: "none",
      reason: "DT R4: half a coordinate is no position",
    },
    {
      location: sample,
      isEnded: true,
      age: 0,
      expected: "none",
      reason: "DT R5: a terminal outcome removes a lingering coordinate",
    },
    {
      location: { ...sample, state: "ended" as const },
      isEnded: false,
      age: 0,
      expected: "none",
      reason: "DT R6: the projection says sharing ended",
    },
    {
      location: sample,
      isEnded: false,
      age: null,
      expected: "none",
      reason: "DT R8: no measurement time, so no honest age to show",
    },
    {
      location: sample,
      isEnded: false,
      age: 59_999,
      expected: "precise fresh",
      reason: "BVA: just under sixty seconds old",
    },
    {
      location: sample,
      isEnded: false,
      age: 60_000,
      expected: "precise stale",
      reason: "BVA: exactly sixty seconds old",
    },
    {
      location: sample,
      isEnded: false,
      age: 60_001,
      expected: "precise stale",
      reason: "BVA: just over sixty seconds old",
    },
    {
      location: { ...sample, state: "stale" as const },
      isEnded: false,
      age: 1_000,
      expected: "precise stale",
      reason: "DT R7: the server's stale verdict wins over a younger local age",
    },
    {
      location: { ...sample, accuracy_m: 49 },
      isEnded: false,
      age: 0,
      expected: "precise fresh",
      reason: "BVA: accuracy just under the 50 m limit",
    },
    {
      location: { ...sample, accuracy_m: 50 },
      isEnded: false,
      age: 0,
      expected: "precise fresh",
      reason: "BVA: accuracy at the 50 m limit",
    },
    {
      location: { ...sample, accuracy_m: 51 },
      isEnded: false,
      age: 0,
      expected: "approximate fresh",
      reason: "BVA: accuracy just over the 50 m limit",
    },
    {
      location: { ...sample, accuracy_m: null },
      isEnded: false,
      age: 0,
      expected: "approximate fresh",
      reason: "EP: unreported accuracy is never precise",
    },
  ]) {
    it(`draws ${expected}: ${reason}`, () => {
      const view = deliveryMapView(location, isEnded, age)
      assert.equal(
        view.kind === "none" ? "none" : `${view.precision} ${view.freshness}`,
        expected,
      )
      if (view.kind === "position") {
        assert.equal(view.latitude, sample.latitude)
        assert.equal(view.longitude, sample.longitude)
      }
    })
  }
})
