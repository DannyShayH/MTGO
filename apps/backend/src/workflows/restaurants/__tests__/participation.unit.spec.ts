import {
  planDeactivationHistory,
  emptiesActiveDeliveryArea,
} from "../participation"

describe("Deactivation history plan", () => {
  it.each([
    {
      state: { is_active: true, is_open: false },
      expected: ["deactivated"],
      reason: "DT R1: active and Closed records only the deactivation",
    },
    {
      state: { is_active: true, is_open: true },
      expected: ["closed", "deactivated"],
      reason:
        "DT R2: active and Open is closed first, so newest first shows the deactivation on top",
    },
    {
      state: { is_active: false, is_open: false },
      expected: [],
      reason:
        "DT R3: an inactive Closed Restaurant records nothing (spec story 36)",
    },
    {
      state: { is_active: false, is_open: true },
      expected: [],
      reason: "DT R4: an inactive Restaurant records nothing even if Open",
    },
  ])("$reason", ({ state, expected }) => {
    expect(planDeactivationHistory(state)).toEqual(expected)
  })
})

describe("Emptying the delivery area of an active Restaurant", () => {
  it.each([
    {
      change: { is_active: true, remaining_count: 0 },
      expected: true,
      reason: "BVA: active with no postal code left is refused",
    },
    {
      change: { is_active: true, remaining_count: 1 },
      expected: false,
      reason: "BVA: active with one postal code left is allowed",
    },
    {
      change: { is_active: false, remaining_count: 0 },
      expected: false,
      reason: "EP: an inactive Restaurant may empty its delivery area",
    },
  ])("$reason", ({ change, expected }) => {
    expect(emptiesActiveDeliveryArea(change)).toBe(expected)
  })
})
