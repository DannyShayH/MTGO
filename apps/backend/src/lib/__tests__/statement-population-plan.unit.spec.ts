import {
  planStatementPopulation,
  retimerAlong,
} from "../statement-population-plan"

/** A Copenhagen wall-clock time in winter (UTC+1) as an instant. */
const cet = (local: string) => new Date(`${local}+01:00`)

const NOW = cet("2026-11-27T15:00:00")
const plan = () => planStatementPopulation({ anchor_date: "2026-11-27" })

describe("Statement verification population (#235)", () => {
  it("plans exactly 100 Customers and 500 Orders, the same on every run", () => {
    const population = plan()
    expect(population.customers).toHaveLength(100)
    expect(population.orders).toHaveLength(500)
    expect(plan()).toEqual(population)
  })

  it("spreads the outcomes over three months, with late deliveries from October", () => {
    const { months, orders } = plan()
    expect(months).toEqual(["2026-09", "2026-10", "2026-11"])
    const count = (filter: (order: (typeof orders)[number]) => boolean) =>
      orders.filter(filter).length
    expect(count(({ original_month }) => original_month === "2026-09")).toBe(
      205,
    )
    expect(count(({ original_month }) => original_month === "2026-10")).toBe(
      235,
    )
    expect(count(({ original_month }) => original_month === "2026-11")).toBe(60)
    expect(
      count(
        ({ outcome, original_month }) =>
          outcome === "delivered_late" && original_month === "2026-10",
      ),
    ).toBe(6)
    for (const outcome of [
      "delivered",
      "customer_cancelled",
      "restaurant_rejected",
      "acceptance_timeout",
      "unassigned_timeout",
      "operator_cancelled",
    ])
      expect(count((order) => order.outcome === outcome)).toBeGreaterThan(5)
    for (const restaurant of ["A", "B", "C", "D"])
      for (const month of ["2026-09", "2026-10", "2026-11"])
        expect(
          count(
            (order) =>
              order.restaurant === restaurant && order.original_month === month,
          ),
        ).toBeGreaterThan(0)
  })

  it("orders every history's milestones as the workflows record them, before now", () => {
    const sequence = [
      "placed_at",
      "accepted_at",
      "claimed_at",
      "preparation_started_at",
      "ready_at",
      "picked_up_at",
      "handed_over_at",
      "deadline_at",
      "cancelled_at",
    ] as const
    for (const { timeline, outcome } of plan().orders) {
      const times = sequence.flatMap((key) =>
        timeline[key] ? [timeline[key]!.getTime()] : [],
      )
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(times.at(-1)!).toBeLessThan(NOW.getTime())
      // Ninety minutes covers the longest delivery or timeout.
      expect(times.at(-1)! - times[0]).toBeLessThan(90 * 60 * 1000)
      expect(!!timeline.handed_over_at).toBe(outcome.startsWith("delivered"))
      expect(!!timeline.preparation_started_at).toBe(
        [
          "delivered",
          "delivered_late",
          "unassigned_timeout",
          "operator_cancelled",
        ].includes(outcome),
      )
    }
  })

  it("places Orders only on dates the Restaurant was active all day", () => {
    const local = (date: Date) =>
      date.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
    const dates = (key: string) =>
      plan()
        .orders.filter(({ restaurant }) => restaurant === key)
        .map(({ timeline }) => local(timeline.placed_at))
    // C joined on 10 September; D paused from 12 to 17 October.
    expect(dates("C").every((date) => date > "2026-09-10")).toBe(true)
    expect(
      dates("D").filter((date) => date >= "2026-10-12" && date <= "2026-10-17"),
    ).toEqual([])
    // November Orders stop before today, so each history is complete.
    expect(
      plan().orders.every(
        ({ timeline }) => local(timeline.placed_at) < "2026-11-27",
      ),
    ).toBe(true)
  })

  it("gives every Customer a distinct plausible name, contact and Danish address, and at least one Order", () => {
    const { customers, orders } = plan()
    const unique = (values: string[]) => new Set(values).size
    expect(unique(customers.map((c) => `${c.first_name} ${c.last_name}`))).toBe(
      100,
    )
    expect(unique(customers.map(({ email }) => email))).toBe(100)
    expect(unique(customers.map(({ phone }) => phone))).toBe(100)
    for (const customer of customers) {
      expect(customer.first_name).not.toMatch(/\d|demo|test|customer/i)
      expect(customer.email).toMatch(/^[a-z0-9.]+@example\.test$/)
      expect(customer.phone).toMatch(/^\+45[2-8]\d{7}$/)
      expect(customer.address_1).toMatch(/^\D+ \d+(, .+)?$/)
      expect(customer.postal_code).toMatch(/^\d{4}$/)
    }
    expect(unique(orders.map(({ customer }) => customer))).toBe(100)
  })

  it("varies baskets, with a few large enough for the higher commission bands", () => {
    const { orders } = plan()
    const items = orders.map(({ basket }) =>
      basket.reduce((sum, { quantity }) => sum + quantity, 0),
    )
    expect(items.filter((count) => count === 1).length).toBeGreaterThan(30)
    expect(items.filter((count) => count >= 10).length).toBeGreaterThan(5)
    const baskets = new Set(orders.map(({ basket }) => JSON.stringify(basket)))
    expect(baskets.size).toBeGreaterThan(250)
  })

  it("refuses an anchor date on a month's first day, which has no earlier date", () => {
    expect(() =>
      planStatementPopulation({ anchor_date: "2026-12-01" }),
    ).toThrow("statement_population_month_too_young")
  })
})

describe("Moving a recorded history onto its planned times (#235)", () => {
  const at = (ms: number) => new Date(ms)
  const twoMilestones = [
    { recorded: 1000, planned: 100_000 },
    { recorded: 2000, planned: 300_000 },
  ]

  it.each([
    {
      milestones: twoMilestones,
      recorded: 1000,
      planned: 100_000,
      reason: "BVA: a time on the first milestone lands on its plan",
    },
    {
      milestones: twoMilestones,
      recorded: 1500,
      planned: 200_000,
      reason: "EP: a time between two milestones keeps its proportion",
    },
    {
      milestones: twoMilestones,
      recorded: 500,
      planned: 99_500,
      reason: "EP: a time before the first milestone keeps its distance",
    },
    {
      milestones: twoMilestones,
      recorded: 2600,
      planned: 300_600,
      reason: "EP: a time after the last milestone keeps its distance",
    },
    {
      milestones: [
        { recorded: 1000, planned: 100_000 },
        { recorded: 1000, planned: 150_000 },
      ],
      recorded: 1200,
      planned: 100_200,
      reason: "BVA: a recorded milestone that does not move forward is ignored",
    },
  ])("$reason", ({ milestones, recorded, planned }) => {
    const retime = retimerAlong(
      milestones.map((milestone) => ({
        recorded: at(milestone.recorded),
        planned: at(milestone.planned),
      })),
    )
    expect(retime(at(recorded)).getTime()).toBe(planned)
  })
})
