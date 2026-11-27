import { expectedStatementManifest } from "../statement-population-manifest"
import type {
  PopulationOrder,
  StatementPopulation,
} from "../statement-population-plan"

/** A Copenhagen wall-clock time as an instant (CEST until 25 October). */
const local = (text: string) =>
  new Date(`${text}${text < "2026-10-25" ? "+02:00" : "+01:00"}`)

const order = (
  slot: string,
  outcome: PopulationOrder["outcome"],
  at: string,
  basket: [string, number][],
  restaurant: PopulationOrder["restaurant"] = "A",
): PopulationOrder => ({
  slot,
  restaurant,
  customer: "customer-001",
  agent: 0,
  outcome,
  basket: basket.map(([handle, quantity]) => ({
    handle: `population-235-${handle}`,
    quantity,
  })),
  timeline: { placed_at: local(at) },
  original_month: at.slice(0, 7),
})

/** A hand-built population whose totals are worked out below. */
const population: StatementPopulation = {
  anchor_date: "2026-11-27",
  anchor_month: "2026-11",
  months: ["2026-09", "2026-10", "2026-11"],
  agents: ["Agent"],
  customers: [],
  restaurants: [
    {
      key: "A",
      created_at: local("2026-09-01T08:00:00"),
      changes: [
        { kind: "activated", occurred_at: local("2026-09-01T09:00:00") },
      ],
    },
    {
      key: "C",
      created_at: local("2026-09-09T14:00:00"),
      changes: [
        { kind: "activated", occurred_at: local("2026-09-10T10:00:00") },
      ],
    },
    {
      key: "D",
      created_at: local("2026-09-01T08:45:00"),
      changes: [
        { kind: "activated", occurred_at: local("2026-09-01T10:00:00") },
        { kind: "deactivated", occurred_at: local("2026-10-12T15:00:00") },
        { kind: "activated", occurred_at: local("2026-10-17T09:00:00") },
      ],
    },
  ],
  orders: [
    // DKK 95 incl. VAT: food credit 76.00, commission 6% = 4.56.
    order("001", "delivered", "2026-09-03T12:00:00", [["margherita", 1]]),
    // 12 x 125 = 1500 incl., 1200 excl.: 6 + 20 + 20 + 6 = 52.00.
    order("002", "delivered", "2026-09-04T12:00:00", [["carbonara", 12]]),
    order("003", "customer_cancelled", "2026-09-05T18:00:00", [
      ["margherita", 1],
    ]),
    // 2 x 115 = 230 incl.: MTOGO-funded 184.00, no commission.
    order("004", "operator_cancelled", "2026-09-06T18:00:00", [["diavola", 2]]),
    // 79 incl. = 63.20; 6% = 3.792 -> 3.79; posted in November: +59.41.
    order("005", "delivered_late", "2026-10-08T19:00:00", [["caesar", 1]]),
    order("006", "restaurant_rejected", "2026-10-09T19:00:00", [
      ["margherita", 2],
    ]),
  ],
}

const NOW = local("2026-11-27T15:00:00")
const statement = (restaurant: string, month: string) =>
  expectedStatementManifest(population, NOW).statements.find(
    (candidate) =>
      candidate.restaurant === restaurant && candidate.month === month,
  )

describe("Expected statement results of the population (#235)", () => {
  it("adds delivered food credit, commission over the bands and MTOGO-funded compensation in their month", () => {
    expect(statement("A", "2026-09")).toEqual({
      restaurant: "A",
      month: "2026-09",
      lifecycle: "closed",
      completeness: "complete",
      entries: 3,
      delivered: 2,
      compensated: 1,
      late_adjustments: 0,
      without_entitlement: { customer_cancelled: 1 },
      active_date_count: 30,
      month_day_count: 30,
      totals: {
        food_credits: "1460.00",
        mtogo_funded_food_credits: "184.00",
        commission: "56.56",
        service_fee: "100.00",
        adjustments: "0.00",
        balance: "1303.44",
      },
    })
  })

  it("closes the late delivery's month as processing pending, withholding delivered totals and the balance", () => {
    expect(statement("A", "2026-10")).toMatchObject({
      lifecycle: "closed",
      completeness: "processing_pending",
      entries: 0,
      delivered: 0,
      without_entitlement: { restaurant_rejected: 1 },
      totals: {
        food_credits: "unavailable",
        mtogo_funded_food_credits: "unavailable",
        commission: "unavailable",
        service_fee: "100.00",
        adjustments: "0.00",
        balance: "unavailable",
      },
    })
  })

  it("posts the late delivery as a current-month adjustment and counts active dates through today", () => {
    expect(statement("A", "2026-11")).toMatchObject({
      lifecycle: "provisional",
      entries: 1,
      late_adjustments: 1,
      active_date_count: 27,
      totals: {
        service_fee: "90.00",
        adjustments: "59.41",
        balance: "-30.59",
      },
    })
  })

  it("prorates the fee for a late joiner and a paused month, rounding once", () => {
    // 21 of 30 days.
    expect(statement("C", "2026-09")?.totals.service_fee).toBe("70.00")
    // 1-12 and 17-31 October: 27 of 31 days = 87.0967... -> 87.10.
    expect(statement("D", "2026-10")).toMatchObject({
      active_date_count: 27,
      month_day_count: 31,
      totals: { service_fee: "87.10", balance: "-87.10" },
    })
  })

  it("summarizes the population, periods and outcome mix", () => {
    expect(expectedStatementManifest(population, NOW).population).toEqual({
      customers: 0,
      orders: 6,
      restaurants: 3,
      months: ["2026-09", "2026-10", "2026-11"],
      outcomes: {
        delivered: 2,
        delivered_late: 1,
        customer_cancelled: 1,
        restaurant_rejected: 1,
        operator_cancelled: 1,
      },
    })
  })
})

describe("Expected commission at the ADR-0006 band edges (#235)", () => {
  const edge = (quantity: number) =>
    expectedStatementManifest(
      {
        ...population,
        restaurants: [population.restaurants[0]],
        orders: [
          order("001", "delivered", "2026-09-03T12:00:00", [
            ["carbonara", quantity],
          ]),
        ],
      },
      NOW,
    ).statements[0].totals.commission

  it.each([
    {
      quantity: 1,
      commission: "6.00",
      reason: "BVA: 100.00 excl. VAT, the top of the 6% band",
    },
    {
      quantity: 5,
      commission: "26.00",
      reason: "BVA: 500.00, the top of the 5% band",
    },
    {
      quantity: 10,
      commission: "46.00",
      reason: "BVA: 1000.00, the top of the 4% band",
    },
    {
      quantity: 11,
      commission: "49.00",
      reason: "BVA: 1100.00, 100 into the 3% band",
    },
  ])("$reason", ({ quantity, commission }) => {
    expect(edge(quantity)).toBe(commission)
  })
})
