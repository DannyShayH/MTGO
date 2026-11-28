import { lastThirtyDays } from "../../feedback/statistics-period"
import { customerRatingFigure, unfulfilledOrdersFigure } from "../reliability"

const period = {
  starts_at: "2026-11-27T13:00:00.000Z",
  ends_at: "2026-11-28T13:00:00.000Z",
}

describe("Unfulfilled Order rate", () => {
  it("EP: 27 delivered, 2 cancelled, 1 not delivered and 10 open give 10% of 30 ended", () => {
    const figure = unfulfilledOrdersFigure(
      [
        { outcome: "delivered", count: 27 },
        { outcome: "customer_cancelled", count: 1 },
        { outcome: "restaurant_rejected", count: 1 },
        { outcome: "not_delivered", count: 1 },
        { outcome: "open", count: 10 },
      ],
      period,
    )
    expect(figure).toEqual({
      period,
      placed: 40,
      ended: 30,
      unfulfilled: 3,
      rate_percent: 10,
      causes: [
        { cause: "customer_cancelled", group: "customer", count: 1 },
        { cause: "restaurant_rejected", group: "restaurant", count: 1 },
        { cause: "acceptance_timeout", group: "restaurant", count: 0 },
        { cause: "unassigned_timeout", group: "mtogo", count: 0 },
        { cause: "operator_cancelled", group: "mtogo", count: 0 },
        { cause: "delivery_failed", group: "mtogo", count: 1 },
      ],
      groups: [
        { group: "customer", count: 1 },
        { group: "restaurant", count: 1 },
        { group: "mtogo", count: 1 },
      ],
      exclusions: [{ reason: "still_open", count: 10 }],
    })
  })

  it.each([
    {
      delivered: 2,
      unfulfilled: 1,
      open: 0,
      rate: 33.3,
      reason: "BVA: 1 of 3 rounds to one decimal",
    },
    {
      delivered: 0,
      unfulfilled: 2,
      open: 0,
      rate: 100,
      reason: "BVA: every ended Order unfulfilled is 100%",
    },
    {
      delivered: 5,
      unfulfilled: 0,
      open: 0,
      rate: 0,
      reason: "BVA: none unfulfilled is a real 0%",
    },
    {
      delivered: 0,
      unfulfilled: 0,
      open: 4,
      rate: null,
      reason: "EP: only open Orders have no rate, never 0%",
    },
    {
      delivered: 0,
      unfulfilled: 0,
      open: 0,
      rate: null,
      reason: "EP: no placements have no rate and leave nothing out",
    },
  ])("$reason", ({ delivered, unfulfilled, open, rate }) => {
    const figure = unfulfilledOrdersFigure(
      [
        { outcome: "delivered" as const, count: delivered },
        { outcome: "operator_cancelled" as const, count: unfulfilled },
        { outcome: "open" as const, count: open },
      ].filter(({ count }) => count > 0),
      period,
    )
    expect(figure.rate_percent).toBe(rate)
    expect(figure.placed).toBe(delivered + unfulfilled + open)
    expect(figure.causes).toHaveLength(6)
    expect(figure.exclusions).toEqual([{ reason: "still_open", count: open }])
  })
})

describe("Average Customer rating", () => {
  const thirtyDays = lastThirtyDays(new Date("2026-11-28T13:00:00.000Z"))

  it.each([
    {
      rows: [
        { experience_rating: 5, count: "2" },
        { experience_rating: 2, count: "1" },
      ],
      average: 4,
      count: 3,
      reason: "EP: two 5s and a 2 average 4 over 3 ratings",
    },
    {
      rows: [],
      average: null,
      count: 0,
      reason: "EP: no ratings have no average, never zero",
    },
  ])("$reason", ({ rows, average, count }) => {
    expect(customerRatingFigure(rows, thirtyDays)).toEqual({
      period: {
        key: "last_30_days",
        starts_at: "2026-10-29T13:00:00.000Z",
        ends_at: "2026-11-28T13:00:00.000Z",
      },
      average,
      count,
      exclusions: [],
    })
  })
})
