import {
  decideLocationSample,
  deliveryLocationView,
  LOCATION_STALE_AFTER_MS,
  type LocationFacts,
} from "../location-rules"

const NOW = new Date("2026-11-22T12:00:00.000Z")
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

const DELIVERY: LocationFacts["delivery"] = {
  order_id: "order_1",
  assigned_agent_id: "dagt_1",
  active_agent_id: "dagt_1",
  picked_up_at: at(-600_000),
  terminal_outcome: null,
}
const holding = (overrides: Partial<LocationFacts> = {}): LocationFacts => ({
  agent: { id: "dagt_1", status: "authorized" },
  delivery: DELIVERY,
  order_active: true,
  latest: null,
  observed_at: at(-2_000),
  ...overrides,
})
const kept = (observedAgoMs: number, receivedAgoMs: number) => ({
  latest: { observed_at: at(-observedAgoMs), received_at: at(-receivedAgoMs) },
})
const refused = (code: string) => ({ outcome: "refused", code })
const recorded = (observed_at: Date) => ({ outcome: "record", observed_at })

describe("decideLocationSample", () => {
  it.each([
    {
      reason: "DT: an agent whose access ended is signed out",
      facts: holding({ agent: { id: "dagt_1", status: "revoked" } }),
      expected: refused("delivery_agent_not_authorized"),
    },
    {
      reason: "DT: another agent never shares this delivery",
      facts: holding({ agent: { id: "dagt_2", status: "authorized" } }),
      expected: refused("delivery_not_responsible"),
    },
    {
      reason: "DT: delivered work stops sharing",
      facts: holding({
        delivery: { ...DELIVERY, terminal_outcome: "delivered" },
      }),
      expected: refused("delivery_not_active"),
    },
    {
      reason: "DT: released capacity stops sharing",
      facts: holding({ delivery: { ...DELIVERY, active_agent_id: null } }),
      expected: refused("delivery_not_active"),
    },
    {
      reason: "DT: a cancelled Order stops sharing before its delivery ends",
      facts: holding({ order_active: false }),
      expected: refused("delivery_not_active"),
    },
    {
      reason: "DT: nothing is shared before pickup",
      facts: holding({ delivery: { ...DELIVERY, picked_up_at: null } }),
      expected: refused("pickup_not_recorded"),
    },
    {
      reason: "DT, EP valid: the first sample in transit",
      facts: holding(),
      expected: recorded(at(-2_000)),
    },
    {
      reason: "BVA: 1 ms beyond the 5 s clock tolerance is refused",
      facts: holding({ observed_at: at(5_001) }),
      expected: refused("location_observed_in_future"),
    },
    {
      reason: "BVA: a clock exactly 5 s fast is capped at the receipt time",
      facts: holding({ observed_at: at(5_000) }),
      expected: recorded(NOW),
    },
    {
      reason: "BVA: an observation exactly ten minutes old is kept",
      facts: holding({ observed_at: at(-600_000) }),
      expected: recorded(at(-600_000)),
    },
    {
      reason: "BVA: 1 ms older than ten minutes is refused",
      facts: holding({ observed_at: at(-600_001) }),
      expected: refused("location_observation_too_old"),
    },
    {
      reason: "BVA: a repeat of the kept observation is not newer",
      facts: holding({ ...kept(10_000, 30_000), observed_at: at(-10_000) }),
      expected: refused("location_out_of_order"),
    },
    {
      reason: "EP: a delayed older observation never replaces a newer one",
      facts: holding({ ...kept(10_000, 30_000), observed_at: at(-20_000) }),
      expected: refused("location_out_of_order"),
    },
    {
      reason:
        "BVA: a newer sample 1 ms within 5 s of the kept receipt coalesces",
      facts: holding({ ...kept(10_000, 4_999), observed_at: at(-1_000) }),
      expected: { outcome: "coalesced" },
    },
    {
      reason: "BVA: a newer sample exactly 5 s after the kept receipt is kept",
      facts: holding({ ...kept(10_000, 5_000), observed_at: at(-1_000) }),
      expected: recorded(at(-1_000)),
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideLocationSample(facts, NOW)).toEqual(expected)
  })
})

describe("deliveryLocationView", () => {
  const sample = {
    latitude: 55.6761,
    longitude: 12.5683,
    accuracy_m: 12,
    observed_at: at(-30_000),
    received_at: NOW,
  }
  const inTransit = { picked_up_at: at(-600_000), terminal_outcome: null }
  const withoutCoordinate = (state: string) => ({
    state,
    latitude: null,
    longitude: null,
    accuracy_m: null,
    observed_at: null,
    received_at: null,
    stale_at: null,
  })
  // Received just now, so only the observation can make it stale.
  const observedAgo = (ms: number, state: string) => ({
    state,
    latitude: 55.6761,
    longitude: 12.5683,
    accuracy_m: 12,
    observed_at: at(-ms).toISOString(),
    received_at: NOW.toISOString(),
    stale_at: at(LOCATION_STALE_AFTER_MS - ms).toISOString(),
  })

  it.each([
    {
      reason: "DT: no delivery yet shows no coordinate",
      delivery: null,
      sample,
      expected: withoutCoordinate("not_started"),
    },
    {
      reason: "DT: before pickup shows no coordinate",
      delivery: { picked_up_at: null, terminal_outcome: null },
      sample,
      expected: withoutCoordinate("not_started"),
    },
    {
      reason: "DT: in transit without a sample is unavailable, never guessed",
      delivery: inTransit,
      sample: null,
      expected: withoutCoordinate("unavailable"),
    },
    {
      reason: "DT: after the terminal outcome, even if a sample were left",
      delivery: { ...inTransit, terminal_outcome: "cancelled" as const },
      sample,
      expected: withoutCoordinate("ended"),
    },
    {
      reason: "DT, EP fresh: the kept coordinate with its times",
      delivery: inTransit,
      sample,
      expected: observedAgo(30_000, "fresh"),
    },
    {
      reason: "BVA: 1 ms before sixty seconds after observation is fresh",
      delivery: inTransit,
      sample: { ...sample, observed_at: at(-59_999) },
      expected: observedAgo(59_999, "fresh"),
    },
    {
      reason: "BVA: exactly sixty seconds after observation is stale",
      delivery: inTransit,
      sample: { ...sample, observed_at: at(-60_000) },
      expected: observedAgo(60_000, "stale"),
    },
    {
      reason: "BVA: after sixty seconds is stale, though received just now",
      delivery: inTransit,
      sample: { ...sample, observed_at: at(-60_001) },
      expected: observedAgo(60_001, "stale"),
    },
  ])("$reason", ({ delivery, sample, expected }) => {
    expect(deliveryLocationView(delivery, sample, NOW)).toEqual(expected)
  })
})
