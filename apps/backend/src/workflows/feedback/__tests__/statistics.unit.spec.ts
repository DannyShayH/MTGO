import { ratingSummary } from "../statistics"

describe("ratingSummary", () => {
  it("averages grouped ratings to one decimal with their distribution", () => {
    expect(
      ratingSummary(
        [
          { food_rating: 1, count: "1" },
          { food_rating: 4, count: "1" },
          { food_rating: 5, count: "1" },
        ],
        "food_rating",
      ),
    ).toEqual({
      average: 3.3,
      count: 3,
      distribution: { "1": 1, "2": 0, "3": 0, "4": 1, "5": 1 },
    })
  })

  it("has no average without ratings: unrated is never zero", () => {
    expect(ratingSummary([], "food_rating")).toEqual({
      average: null,
      count: 0,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    })
  })
})
