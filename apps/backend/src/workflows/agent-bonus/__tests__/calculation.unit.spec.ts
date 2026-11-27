import {
  calculateBonusAmount,
  calculateBonusFunding,
  calculateBonusPoints,
} from "../calculation"
import { copenhagenMonthPeriod } from "../../shared/copenhagen-time"

describe("delivery Bonus points", () => {
  it("preserves the exact VAT-exclusive food value", () => {
    expect(calculateBonusPoints("50.31", "2026-01-15T11:00:00Z", null)).toEqual(
      {
        food_value: "40.248",
        time_bonus: false,
        rating_bonus: false,
        points: "40.248",
      },
    )
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
    expect(calculateBonusPoints("250", pickup, null).time_bonus).toBe(expected)
  })

  it.each([
    { rating: 4, expected: true, reason: "BVA: lowest bonus rating" },
    { rating: 5, expected: true, reason: "BVA: highest rating" },
    { rating: 3, expected: false, reason: "BVA: below bonus rating" },
    { rating: null, expected: false, reason: "EP: missing feedback" },
  ])("$reason", ({ rating, expected }) => {
    expect(
      calculateBonusPoints("250", "2026-01-15T21:00:00Z", rating),
    ).toMatchObject({
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

describe("Bonus funding and pool", () => {
  const commission = (amount: string) => ({
    kind: "delivered_order" as const,
    commission: amount,
    food_credit: "0",
    funded_by: "customer" as const,
  })
  const compensation = (amount: string) => ({
    kind: "prepared_food_compensation" as const,
    commission: "0",
    food_credit: amount,
    funded_by: "mtogo" as const,
  })

  it.each([
    {
      entries: [commission("1000"), compensation("300")],
      expected: {
        commission: "1000",
        reversals: "0",
        compensation: "300",
        carried_loss: "0",
        balance: "700",
        pool: "140",
      },
      reason: "EP: 20% of commission after MTOGO-funded compensation",
    },
    {
      entries: [commission("1000"), commission("-50")],
      expected: { commission: "1000", reversals: "50", balance: "950" },
      reason: "EP: a refund counts only through the commission it reverses",
    },
    {
      // A cancelled DKK 250 Order with DKK 120 compensation and a pending
      // refund obligation: the obligation is never a journal fact.
      entries: [commission("1000"), compensation("120")],
      expected: { compensation: "120", balance: "880", pool: "176" },
      reason: "EP: a cancelled Order's compensation, not its refund",
    },
    {
      entries: [
        { ...commission("100"), food_credit: "400" },
        // As closure books a service-fee difference: MTOGO-funded, and
        // only its `service_fee` (which funding has no field for) is set.
        {
          kind: "service_fee_difference" as const,
          commission: "0",
          food_credit: "0",
          funded_by: "mtogo" as const,
        },
      ],
      expected: { compensation: "0", balance: "100", pool: "20" },
      reason: "EP: service fees and Customer-funded food credits never count",
    },
  ])("funds the month: $reason", ({ entries, expected }) => {
    expect(calculateBonusFunding(entries)).toMatchObject(expected)
  })

  it.each([
    { entries: [], expected: null, reason: "EP: no facts" },
    {
      entries: [commission("120"), compensation("120.01")],
      expected: null,
      reason: "BVA: one øre below zero",
    },
    {
      entries: [commission("120"), compensation("120")],
      expected: null,
      reason: "BVA: zero funding",
    },
    {
      entries: [commission("120.01"), compensation("120")],
      expected: "0.002",
      reason: "BVA: one øre above zero",
    },
  ])("pools 20% of positive funding only: $reason", ({ entries, expected }) => {
    expect(calculateBonusFunding(entries).pool).toBe(expected)
  })

  it.each([
    {
      carriedLoss: "1000",
      expected: null,
      reason: "BVA: loss equals commission",
    },
    {
      carriedLoss: "999.99",
      expected: "0.002",
      reason: "BVA: one øre earned back",
    },
    { carriedLoss: "400", expected: "120", reason: "EP: part earned back" },
  ])("subtracts a carried loss first: $reason", ({ carriedLoss, expected }) => {
    expect(calculateBonusFunding([commission("1000")], carriedLoss).pool).toBe(
      expected,
    )
  })
})

describe("Bonus amounts", () => {
  it.each([
    {
      pool: "140",
      allPoints: "400",
      points: "300",
      expected: "105",
      reason: "EP: in proportion to points",
    },
    {
      pool: "100",
      allPoints: "150",
      points: "50",
      expected: "33.33",
      reason: "EP: DKK 100.00 by three equal agents, MTOGO retaining 0.01",
    },
    {
      pool: "1",
      allPoints: "100",
      points: "1",
      expected: "0.01",
      reason: "BVA: exactly one øre",
    },
    {
      pool: "1",
      allPoints: "100",
      points: "0.99",
      expected: "0",
      reason: "BVA: just below one øre gives DKK 0.00",
    },
    {
      pool: "1",
      allPoints: "100",
      points: "1.01",
      expected: "0.01",
      reason: "BVA: just above one øre rounds down to it",
    },
    {
      pool: "140.002",
      allPoints: "152",
      points: "76",
      expected: "70",
      reason: "EP: rounded down, never up",
    },
    {
      pool: null,
      allPoints: "10",
      points: "10",
      expected: null,
      reason: "EP: no pool",
    },
    {
      pool: "100",
      allPoints: "0",
      points: "0",
      expected: null,
      reason: "BVA: no points",
    },
    {
      pool: "100",
      allPoints: "10",
      points: "0",
      expected: null,
      reason: "BVA: an agent without points while others have some",
    },
  ])("$reason", ({ pool, allPoints, points, expected }) => {
    expect(calculateBonusAmount(pool, allPoints, points)).toBe(expected)
  })
})
