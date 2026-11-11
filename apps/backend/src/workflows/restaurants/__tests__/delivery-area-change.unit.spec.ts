import { planDeliveryAreaChange } from "../delivery-area-change"

describe("Delivery area change plan", () => {
  it.each([
    {
      current: [],
      add: ["2200", "2100"],
      remove: [],
      expected: { create: ["2100", "2200"], remove: [] },
      reason: "EP: adds new postal codes, sorted",
    },
    {
      current: ["2200"],
      add: ["2200", "2100"],
      remove: [],
      expected: { create: ["2100"], remove: [] },
      reason: "EP: a postal code already served changes nothing",
    },
    {
      current: [],
      add: ["2100", "2100"],
      remove: [],
      expected: { create: ["2100"], remove: [] },
      reason: "EP: a postal code repeated in one request is added once",
    },
    {
      current: ["2100", "2200"],
      add: [],
      remove: ["2100"],
      expected: { create: [], remove: ["2100"] },
      reason: "EP: removes a served postal code",
    },
    {
      current: ["2200"],
      add: [],
      remove: ["8000"],
      expected: { create: [], remove: [] },
      reason: "EP: removing a postal code outside the area changes nothing",
    },
    {
      current: ["1050", "1051", "2200"],
      add: ["2100"],
      remove: ["1050", "1051"],
      expected: { create: ["2100"], remove: ["1050", "1051"] },
      reason: "DT: adds and removes in one change",
    },
    {
      current: [],
      add: [],
      remove: [],
      expected: { create: [], remove: [] },
      reason: "BVA: an empty change changes nothing",
    },
  ])("$reason", ({ current, add, remove, expected }) => {
    expect(planDeliveryAreaChange({ current, add, remove })).toEqual(expected)
  })
})
