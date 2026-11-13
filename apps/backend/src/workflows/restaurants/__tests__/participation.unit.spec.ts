import {
  planDeactivationHistory,
  emptiesActiveDeliveryArea,
  planOpeningChange,
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

describe("Opening and closing plan", () => {
  it.each([
    {
      state: { is_active: true, is_open: false },
      isOpening: true,
      expected: "opened",
      reason: "DT O1: an active Closed Restaurant opens",
    },
    {
      state: { is_active: true, is_open: true },
      isOpening: true,
      expected: null,
      reason: "DT O2: opening an Open Restaurant records nothing",
    },
    {
      state: { is_active: true, is_open: true },
      isOpening: false,
      expected: "closed",
      reason: "DT O3: an active Open Restaurant closes",
    },
    {
      state: { is_active: true, is_open: false },
      isOpening: false,
      expected: null,
      reason: "DT O4: closing a Closed Restaurant records nothing",
    },
    {
      state: { is_active: false, is_open: false },
      isOpening: false,
      expected: null,
      reason: "DT O5: closing an inactive Closed Restaurant records nothing",
    },
    {
      state: { is_active: false, is_open: true },
      isOpening: false,
      expected: "closed",
      reason: "DT O6: closing is always allowed, so staff are never stuck Open",
    },
    {
      state: { is_active: false, is_open: false },
      isOpening: true,
      expected: "restaurant_inactive_cannot_open",
      reason: "DT O7: opening an inactive Restaurant is refused",
    },
    {
      state: { is_active: false, is_open: true },
      isOpening: true,
      expected: "restaurant_inactive_cannot_open",
      reason: "DT O8: opening an inactive Restaurant is refused even if Open",
    },
  ])("$reason", ({ state, isOpening, expected }) => {
    const plan = () => planOpeningChange(state, isOpening)
    if (expected === "restaurant_inactive_cannot_open")
      expect(plan).toThrow(
        expect.objectContaining({ type: "not_allowed", code: expected }),
      )
    else expect(plan()).toBe(expected)
  })
})
