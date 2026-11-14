import { matchDeliveryArea } from "../delivery-area-match"

const restaurant = (id: string, codes: string[]) => ({
  id,
  delivery_area_postal_codes: codes,
})

describe("matchDeliveryArea", () => {
  it.each([
    {
      restaurants: [restaurant("serves", ["2200"])],
      location: ["2200"],
      expected: [{ id: "serves", served: 1, of: 1 }],
      reason: "EP: the exact code is in the delivery area",
    },
    {
      restaurants: [restaurant("elsewhere", ["8000"])],
      location: ["2200"],
      expected: [],
      reason: "EP: the code is outside the delivery area",
    },
    {
      restaurants: [restaurant("no-area", [])],
      location: ["2200"],
      expected: [],
      reason: "BVA: an empty delivery area serves nothing",
    },
    {
      restaurants: [restaurant("serves", ["2200"])],
      location: [],
      expected: [],
      reason: "BVA: an unknown location has no codes and matches nothing",
    },
    {
      restaurants: [restaurant("part", ["1050", "1051", "2200"])],
      location: ["1050", "1051", "1052"],
      expected: [{ id: "part", served: 2, of: 3 }],
      reason:
        "DT: a town match lists the Restaurant once and counts the town codes it serves",
    },
    {
      restaurants: [restaurant("whole", ["1050", "1051", "1052"])],
      location: ["1050", "1051", "1052"],
      expected: [{ id: "whole", served: 3, of: 3 }],
      reason: "BVA: serving every code of the town",
    },
    {
      restaurants: [
        restaurant("b", ["2200"]),
        restaurant("a", ["2200"]),
        restaurant("none", ["8000"]),
      ],
      location: ["2200"],
      expected: [
        { id: "b", served: 1, of: 1 },
        { id: "a", served: 1, of: 1 },
      ],
      reason:
        "EP: keeps the given order and drops only the Restaurants that serve nothing",
    },
  ])("$reason", ({ restaurants, location, expected }) => {
    expect(
      matchDeliveryArea(restaurants, location).map(
        ({ id, delivery_area_match }) => ({
          id,
          served: delivery_area_match.served_postal_codes,
          of: delivery_area_match.location_postal_codes,
        }),
      ),
    ).toEqual(expected)
  })
})
