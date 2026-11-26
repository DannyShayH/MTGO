import {
  earningsOfMonth,
  restaurantPage,
  statementSummary,
  type RestaurantEarnings,
  type RestaurantStatementSummary,
} from "../earnings-rules"
import type { Total, UnavailableReason } from "../statement-rules"

const sum = (amount: string): Total => ({ status: "available", amount })
const withheld = (reason: UnavailableReason): Total => ({
  status: "unavailable",
  reason,
})

/** A Restaurant's statement summary for the month, complete by default. */
const summary = (
  id: string,
  totals: Partial<
    Record<"commission" | "service_fee" | "mtogo_funded_food_credits", Total>
  > = {},
  completeness: RestaurantStatementSummary["completeness"] = "complete",
): RestaurantStatementSummary => ({
  restaurant: { id, name: `Restaurant ${id}` },
  lifecycle: "closed",
  completeness,
  totals: {
    commission: totals.commission ?? sum("0"),
    service_fee: totals.service_fee ?? sum("0"),
  },
  mtogo_funded_food_credits: totals.mtogo_funded_food_credits ?? sum("0"),
})

describe("What MTOGO earned across all Restaurants in a month (#256)", () => {
  it("adds up the Restaurants' statements: DKK 600 delivered and 15 of 30 active days earn 30 commission and 50 service fee", () => {
    const earnings = earningsOfMonth("2026-11", "closed", [
      summary("a", { commission: sum("30"), service_fee: sum("50") }),
      summary("b", { commission: sum("4.56"), service_fee: sum("0") }),
    ])

    expect(earnings.summary).toEqual({
      month: "2026-11",
      lifecycle: "closed",
      completeness: "complete",
      restaurant_count: 2,
      totals: {
        commission: sum("34.56"),
        service_fee: sum("50"),
        earnings: sum("84.56"),
        mtogo_funded_food_credits: sum("0"),
      },
      withheld_restaurants: [],
    })
    expect(earnings.restaurants[0]).toEqual({
      restaurant: { id: "a", name: "Restaurant a" },
      lifecycle: "closed",
      completeness: "complete",
      totals: {
        commission: sum("30"),
        service_fee: sum("50"),
        earnings: sum("80"),
        mtogo_funded_food_credits: sum("0"),
      },
    })
  })

  it("keeps MTOGO-funded prepared-food compensation a separate cost, outside earnings", () => {
    const { summary: month } = earningsOfMonth("2026-11", "closed", [
      summary("a", {
        commission: sum("0"),
        mtogo_funded_food_credits: sum("76"),
      }),
      summary("b", {
        commission: sum("-4.56"),
        mtogo_funded_food_credits: sum("38"),
      }),
    ])

    expect(month.totals).toEqual({
      commission: sum("-4.56"),
      service_fee: sum("0"),
      earnings: sum("-4.56"),
      mtogo_funded_food_credits: sum("114"),
    })
  })

  it("withholds only the affected totals and names every Restaurant that is not complete", () => {
    const { summary: month, restaurants } = earningsOfMonth(
      "2026-11",
      "provisional",
      [
        summary("a", { commission: sum("30") }),
        summary(
          "b",
          { service_fee: withheld("evidence_missing") },
          "incomplete",
        ),
        summary("c", {}, "processing_pending"),
      ],
    )

    expect(month).toMatchObject({
      lifecycle: "provisional",
      completeness: "incomplete",
      totals: {
        commission: sum("30"),
        service_fee: withheld("evidence_missing"),
        earnings: withheld("depends_on_unavailable"),
        mtogo_funded_food_credits: sum("0"),
      },
      withheld_restaurants: [
        {
          restaurant: { id: "b", name: "Restaurant b" },
          completeness: "incomplete",
        },
        {
          restaurant: { id: "c", name: "Restaurant c" },
          completeness: "processing_pending",
        },
      ],
    })
    expect(restaurants[1].totals.earnings).toEqual(
      withheld("depends_on_unavailable"),
    )
  })

  it.each([
    {
      reason:
        "DT: missing evidence is named first, it does not resolve by waiting",
      commissions: [
        withheld("processing_pending"),
        withheld("evidence_missing"),
      ],
      expected: withheld("evidence_missing"),
    },
    {
      reason: "DT: every withholding Restaurant is only still processing",
      commissions: [withheld("processing_pending"), sum("30")],
      expected: withheld("processing_pending"),
    },
    {
      reason: "DT: every Restaurant's total is known, so they add up",
      commissions: [sum("30"), sum("-4.56")],
      expected: sum("25.44"),
    },
  ])("$reason", ({ commissions, expected }) => {
    const { summary: month } = earningsOfMonth(
      "2026-11",
      "closed",
      commissions.map((commission, index) =>
        summary(String(index), { commission }),
      ),
    )
    expect(month.totals.commission).toEqual(expected)
  })

  it.each([
    {
      reason: "DT: any incomplete Restaurant makes the month incomplete",
      states: ["complete", "processing_pending", "incomplete"] as const,
      expected: "incomplete",
    },
    {
      reason: "DT: processing pending without an incomplete Restaurant",
      states: ["complete", "processing_pending"] as const,
      expected: "processing_pending",
    },
    {
      reason: "DT: every Restaurant complete",
      states: ["complete", "complete"] as const,
      expected: "complete",
    },
  ])("$reason", ({ states, expected }) => {
    const { summary: month } = earningsOfMonth(
      "2026-11",
      "closed",
      states.map((state, index) => summary(String(index), {}, state)),
    )
    expect(month.completeness).toBe(expected)
  })

  it.each([
    {
      reason: "DT: commission withheld, service fee known",
      commission: withheld("processing_pending"),
      service_fee: sum("50"),
      expected: withheld("depends_on_unavailable"),
    },
    {
      reason: "DT: commission known, service fee withheld",
      commission: sum("30"),
      service_fee: withheld("evidence_missing"),
      expected: withheld("depends_on_unavailable"),
    },
    {
      reason: "DT: both known, earnings are their sum",
      commission: sum("30"),
      service_fee: sum("50"),
      expected: sum("80"),
    },
  ])("$reason", ({ commission, service_fee, expected }) => {
    const { summary: month, restaurants } = earningsOfMonth(
      "2026-11",
      "closed",
      [summary("a", { commission, service_fee })],
    )
    expect(restaurants[0].totals.earnings).toEqual(expected)
    expect(month.totals.earnings).toEqual(expected)
  })

  it("is a complete zero for a month without Restaurants", () => {
    expect(earningsOfMonth("2026-11", "closed", []).summary).toMatchObject({
      completeness: "complete",
      restaurant_count: 0,
      totals: { commission: sum("0"), earnings: sum("0") },
    })
  })
})

describe("A Restaurant's statement as Earnings reads it (#256)", () => {
  it("keeps only the summary of the statement, not its entries or evidence", () => {
    const totals = {
      food_credits: sum("76"),
      commission: sum("4.56"),
      service_fee: withheld("evidence_missing"),
      adjustments: sum("0"),
      balance: withheld("depends_on_unavailable"),
    }
    // A whole statement, with its problems and days.
    const statement = {
      restaurant: { id: "a", name: "Pizzeria" },
      lifecycle: "closed" as const,
      completeness: "incomplete" as const,
      totals,
      mtogo_funded_food_credits: sum("0"),
      problems: [{ code: "participation_evidence_missing", count: 1 }],
      days: [{ date: "2026-11-01" }],
    }
    expect(statementSummary(statement)).toEqual({
      restaurant: { id: "a", name: "Pizzeria" },
      lifecycle: "closed",
      completeness: "incomplete",
      totals: {
        commission: sum("4.56"),
        service_fee: withheld("evidence_missing"),
      },
      mtogo_funded_food_credits: sum("0"),
    })
  })
})

describe("Finding a Restaurant among many in a month's Earnings (#256)", () => {
  /** A row whose earnings are the given amount, or withheld. */
  const row = (
    name: string,
    earnings: Total,
    completeness: RestaurantEarnings["completeness"] = "complete",
  ): RestaurantEarnings => ({
    restaurant: { id: name.toLowerCase(), name },
    lifecycle: "closed",
    completeness,
    totals: {
      commission: earnings,
      service_fee: sum("0"),
      earnings,
      mtogo_funded_food_credits: sum("0"),
    },
  })
  const rows = [
    row("Burger Bar", sum("80")),
    row("Pizzeria", sum("120.5")),
    row("Sushi", withheld("processing_pending"), "processing_pending"),
    row("Ramen", sum("-4.56")),
    row("Falafel", sum("80")),
  ]
  const names = (page: { restaurants: RestaurantEarnings[] }) =>
    page.restaurants.map(({ restaurant }) => restaurant.name)
  const query = { limit: 20, offset: 0 }

  it.each([
    {
      reason:
        "EP: by default the most earning Restaurant comes first, withheld last",
      order: undefined,
      expected: ["Pizzeria", "Burger Bar", "Falafel", "Ramen", "Sushi"],
    },
    {
      reason: "EP: ascending earnings still keeps a withheld Restaurant last",
      order: "earnings",
      expected: ["Ramen", "Burger Bar", "Falafel", "Pizzeria", "Sushi"],
    },
    {
      reason: "EP: by name, A to Z",
      order: "name",
      expected: ["Burger Bar", "Falafel", "Pizzeria", "Ramen", "Sushi"],
    },
    {
      reason: "EP: by name, Z to A",
      order: "-name",
      expected: ["Sushi", "Ramen", "Pizzeria", "Falafel", "Burger Bar"],
    },
  ] as const)("$reason", ({ order, expected }) => {
    expect(names(restaurantPage(rows, { ...query, order }))).toEqual(expected)
  })

  it.each([
    {
      reason: "EP: search matches part of a name, ignoring case",
      filter: { q: "BAR" },
      expected: ["Burger Bar"],
      count: 1,
    },
    {
      reason: "EP: only Restaurants whose statement is not complete",
      filter: { completeness: ["incomplete", "processing_pending"] as const },
      expected: ["Sushi"],
      count: 1,
    },
    {
      reason: "BVA: the second page of two rows",
      filter: { limit: 2, offset: 2 },
      expected: ["Falafel", "Ramen"],
      count: 5,
    },
    {
      reason: "BVA: a page past the last row is empty but keeps the count",
      filter: { offset: 5 },
      expected: [],
      count: 5,
    },
  ])("$reason", ({ filter, expected, count }) => {
    const page = restaurantPage(rows, { ...query, ...filter })
    expect(names(page)).toEqual(expected)
    expect(page.count).toBe(count)
  })
})
