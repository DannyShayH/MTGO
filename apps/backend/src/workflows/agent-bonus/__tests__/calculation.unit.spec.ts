import { bonusPoints } from "../calculation"
import { copenhagenMonthPeriod } from "../../shared/copenhagen-time"

describe("delivery Bonus points", () => {
  it("preserves the exact VAT-exclusive food value", () => {
    expect(bonusPoints("50.31", "2026-01-15T11:00:00Z", null)).toEqual({
      food_value: "40.248",
      time_bonus: false,
      rating_bonus: false,
      points: "40.248",
    })
  })

  it.each([
    {
      pickup: "2026-01-15T04:59:59Z",
      expected: true,
      reason: "BVA: one second before 06:00",
    },
    {
      pickup: "2026-01-15T05:00:00Z",
      expected: true,
      reason: "BVA: exactly 06:00",
    },
    {
      pickup: "2026-01-15T07:59:59Z",
      expected: true,
      reason: "BVA: one second before 09:00",
    },
    {
      pickup: "2026-01-15T08:00:00Z",
      expected: false,
      reason: "BVA: exactly 09:00",
    },
    {
      pickup: "2026-01-15T19:59:59Z",
      expected: false,
      reason: "BVA: one second before 21:00",
    },
    {
      pickup: "2026-01-15T20:00:00Z",
      expected: true,
      reason: "BVA: exactly 21:00",
    },
    {
      pickup: "2026-03-29T00:30:00Z",
      expected: true,
      reason: "EP: before spring clock change",
    },
    {
      pickup: "2026-03-29T01:30:00Z",
      expected: true,
      reason: "EP: after spring clock change",
    },
    {
      pickup: "2026-10-25T00:30:00Z",
      expected: true,
      reason: "EP: first repeated autumn hour",
    },
    {
      pickup: "2026-10-25T01:30:00Z",
      expected: true,
      reason: "EP: second repeated autumn hour",
    },
  ])("$reason", ({ pickup, expected }) => {
    expect(bonusPoints("250", pickup, null).time_bonus).toBe(expected)
  })

  it.each([
    { rating: 4, expected: true, reason: "BVA: lowest bonus rating" },
    { rating: 5, expected: true, reason: "BVA: highest rating" },
    { rating: 3, expected: false, reason: "BVA: below bonus rating" },
    { rating: null, expected: false, reason: "EP: missing feedback" },
  ])("$reason", ({ rating, expected }) => {
    expect(bonusPoints("250", "2026-01-15T21:00:00Z", rating)).toMatchObject({
      rating_bonus: expected,
      points: expected ? "275" : "250",
    })
  })
})

it("ends the Copenhagen December at the start of the next year", () => {
  const period = copenhagenMonthPeriod("2026-12")
  expect(period.starts_at.toISOString()).toBe("2026-11-30T23:00:00.000Z")
  expect(period.ends_at.toISOString()).toBe("2026-12-31T23:00:00.000Z")
})
