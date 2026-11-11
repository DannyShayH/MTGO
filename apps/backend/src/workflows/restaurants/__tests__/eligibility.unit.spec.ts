import { evaluateNewOrderEligibility } from "../eligibility"

describe("Restaurant new-Order eligibility", () => {
  it.each([
    {
      active: false,
      open: true,
      codes: ["2200"],
      destination: "2200",
      reason: "DT: inactive precedes all other reasons",
      expected: "restaurant_inactive",
    },
    {
      active: true,
      open: false,
      codes: [],
      destination: undefined,
      reason: "DT: closed precedes missing delivery area",
      expected: "restaurant_closed",
    },
    {
      active: true,
      open: true,
      codes: [],
      destination: undefined,
      reason: "DT: no delivery area",
      expected: "delivery_area_missing",
    },
    {
      active: true,
      open: true,
      codes: ["2200"],
      destination: "2100",
      reason: "DT: destination outside delivery area",
      expected: "destination_not_served",
    },
    {
      active: true,
      open: true,
      codes: ["2200"],
      destination: "2200",
      reason: "DT: destination served",
      expected: null,
    },
    {
      active: true,
      open: true,
      codes: ["2200"],
      destination: undefined,
      reason: "DT: status without a destination",
      expected: null,
    },
  ])("$reason", ({ active, open, codes, destination, expected }) => {
    expect(
      evaluateNewOrderEligibility(
        { is_active: active, is_open: open, delivery_postal_codes: codes },
        destination,
      ),
    ).toEqual({ receiving_new_orders: expected === null, reason: expected })
  })
})
