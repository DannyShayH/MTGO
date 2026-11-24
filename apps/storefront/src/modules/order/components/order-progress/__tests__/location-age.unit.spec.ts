import assert from "node:assert/strict"
import { test } from "node:test"
import { locationAge, locationIsStale } from "../location-age.ts"

test("location ages from server time while offline and turns stale at sixty seconds", () => {
  const observed = "2026-01-01T00:00:00.000Z"
  const server = "2026-01-01T00:00:10.000Z"
  assert.equal(locationIsStale(locationAge(server, observed, 49_999)), false)
  assert.equal(locationIsStale(locationAge(server, observed, 50_000)), true)
  assert.equal(locationAge(server, observed, 100_000), 110_000)
})
