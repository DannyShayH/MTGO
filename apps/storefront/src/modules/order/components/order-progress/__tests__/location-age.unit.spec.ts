import assert from "node:assert/strict"
import { test } from "node:test"
import {
  locationAge,
  locationIsStale,
  shownLocationState,
} from "../location-age.ts"

test("location ages from server time while offline and turns stale at sixty seconds", () => {
  const observed = "2026-01-01T00:00:00.000Z"
  const server = "2026-01-01T00:00:10.000Z"
  assert.equal(locationIsStale(locationAge(server, observed, 49_999)), false)
  assert.equal(locationIsStale(locationAge(server, observed, 50_000)), true)
  assert.equal(locationAge(server, observed, 100_000), 110_000)
})

test("text and map share one shown location state", () => {
  const fresh = {
    state: "fresh" as const,
    latitude: 55.6761,
    longitude: 12.5683,
    accuracy_m: 12,
    observed_at: "2026-01-01T00:00:00.000Z",
    received_at: "2026-01-01T00:00:01.000Z",
    stale_at: "2026-01-01T00:01:00.000Z",
    revision: 1,
  }
  assert.equal(shownLocationState(null, false, null), "not_started")
  assert.equal(shownLocationState(fresh, true, 0), "ended")
  assert.equal(shownLocationState(fresh, false, 59_999), "fresh")
  assert.equal(shownLocationState(fresh, false, 60_000), "stale")
  assert.equal(shownLocationState(fresh, false, null), "fresh")
  assert.equal(
    shownLocationState({ ...fresh, state: "unavailable" }, false, 90_000),
    "unavailable",
  )
})
