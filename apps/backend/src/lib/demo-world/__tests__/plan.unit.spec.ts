import { copenhagenParts } from "../../../workflows/shared/copenhagen-time"
import { STREETS } from "../people"
import {
  DEMO_WORLD_CUSTOMER_COUNT,
  lastMomentOf,
  NOW_SLOT_PREFIX,
  planDemoWorld,
  retimerNearest,
  settledNowTimeline,
  type DemoWorldOrder,
} from "../plan"
import { DEMO_WORLD_RESTAURANTS, PAUSED_RESTAURANT_KEY } from "../restaurants"

const MINUTE = 60 * 1000
const DOMAIN = "corral.dk"
const now = new Date("2026-11-28T15:00:00Z")
const plan = planDemoWorld({ now, email_domain: DOMAIN })

const dateOf = (order: DemoWorldOrder) => order.slot.slice(0, 10)
const days = new Set(plan.orders.map(dateOf)).size
const perDay = (key: string) =>
  plan.orders.filter(({ restaurant }) => restaurant === key).length / days

describe("demo world plan (#258)", () => {
  it("covers the two previous Copenhagen months and the current month so far", () => {
    expect(plan.months).toEqual(["2026-09", "2026-10", "2026-11"])
    expect(plan.from.toISOString()).toBe("2026-08-31T22:00:00.000Z")
    expect(dateOf(plan.orders[0])).toBe("2026-09-01")
    expect(
      plan.orders.every((order) => order.timeline.placed_at >= plan.from),
    ).toBe(true)
  })

  it("plans three prime and sixteen general Restaurants, all in Copenhagen", () => {
    expect(DEMO_WORLD_RESTAURANTS.filter(({ prime }) => prime)).toHaveLength(3)
    expect(DEMO_WORLD_RESTAURANTS[0].key).toBe("scarpetta")
    for (const restaurant of DEMO_WORLD_RESTAURANTS) {
      for (const code of restaurant.delivery_area)
        expect(STREETS[code]).toBeDefined()
      expect(restaurant.delivery_area[0]).toBe(restaurant.postal_code)
    }
  })

  it("gives prime Restaurants 20-30 dishes and general ones about 10-15, with drinks", () => {
    for (const restaurant of DEMO_WORLD_RESTAURANTS) {
      const dishes = restaurant.menu.flatMap(({ dishes }) => dishes)
      const [min, max] = restaurant.prime ? [20, 32] : [9, 18]
      expect(dishes.length).toBeGreaterThanOrEqual(min)
      expect(dishes.length).toBeLessThanOrEqual(max)
      expect(dishes.some(({ role }) => role === "drink")).toBe(true)
      expect(new Set(dishes.map(({ key }) => key)).size).toBe(dishes.length)
    }
    const scarpetta = DEMO_WORLD_RESTAURANTS[0].menu.flatMap(
      ({ dishes }) => dishes,
    )
    expect(scarpetta.map(({ name }) => name.en)).toContain(
      "Pizza Cavolfiore with truffle",
    )
  })

  it("sizes volume by profile: Scarpetta about 10 a day, general ones about 1", () => {
    expect(perDay("scarpetta")).toBeGreaterThan(8.5)
    expect(perDay("scarpetta")).toBeLessThan(12.5)
    for (const restaurant of DEMO_WORLD_RESTAURANTS.filter(
      ({ prime }) => !prime,
    ))
      expect(perDay(restaurant.key)).toBeGreaterThan(0.3)
    expect(plan.customers).toHaveLength(DEMO_WORLD_CUSTOMER_COUNT)
    expect(plan.agents).toHaveLength(25)
  })

  it("scales every Restaurant's volume for a trial run", () => {
    const small = planDemoWorld({ now, email_domain: DOMAIN, scale: 0.1 })
    expect(small.orders.length).toBeLessThan(plan.orders.length * 0.15)
    expect(small.orders.length).toBeGreaterThan(plan.orders.length * 0.05)
  })

  it("peaks at lunch (11-13) and dinner (17-20)", () => {
    const hours = plan.orders.map(
      ({ timeline }) => copenhagenParts(timeline.placed_at).hour,
    )
    const peak = hours.filter(
      (hour) => (hour >= 11 && hour < 14) || (hour >= 17 && hour < 21),
    )
    expect(peak.length / hours.length).toBeGreaterThan(0.75)
    const night = hours.filter((hour) => hour < 10 || hour >= 23)
    expect(night).toHaveLength(0)
  })

  it("is busier at weekends", () => {
    const count = (weekdays: number[]) => {
      const dates = new Set(
        plan.orders
          .map(dateOf)
          .filter((date) =>
            weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()),
          ),
      )
      return (
        plan.orders.filter((order) => dates.has(dateOf(order))).length /
        dates.size
      )
    }
    expect(count([5, 6])).toBeGreaterThan(count([1, 2, 3]) * 1.3)
  })

  it("leaves about 5% unfulfilled, across every cause", () => {
    const unfulfilled = plan.orders.filter(
      ({ outcome }) => outcome !== "delivered",
    )
    const share = unfulfilled.length / plan.orders.length
    expect(share).toBeGreaterThan(0.035)
    expect(share).toBeLessThan(0.065)
    expect(new Set(unfulfilled.map(({ outcome }) => outcome))).toEqual(
      new Set([
        "customer_cancelled",
        "restaurant_rejected",
        "acceptance_timeout",
        "unassigned_timeout",
        "operator_cancelled",
      ]),
    )
    expect(
      plan.orders
        .filter(({ outcome }) =>
          ["restaurant_rejected", "operator_cancelled"].includes(outcome),
        )
        .every(({ note }) => !!note),
    ).toBe(true)
  })

  it("varies food and agent ratings, and rates after the handover", () => {
    const rated = plan.orders.filter(({ rating }) => rating)
    const delivered = plan.orders.filter(
      ({ outcome }) => outcome === "delivered",
    )
    expect(rated.length / delivered.length).toBeGreaterThan(0.45)
    for (const field of ["food_rating", "agent_rating"] as const)
      expect(new Set(rated.map(({ rating }) => rating![field]))).toEqual(
        new Set([1, 2, 3, 4, 5]),
      )
    expect(
      rated.every(
        ({ rating, timeline }) => rating!.rated_at > timeline.handed_over_at!,
      ),
    ).toBe(true)
    // Restaurants differ: the best usual food beats the weakest.
    const mean = (key: string) => {
      const own = rated.filter(({ restaurant }) => restaurant === key)
      return (
        own.reduce((sum, { rating }) => sum + rating!.food_rating, 0) /
        own.length
      )
    }
    expect(mean("ceviche-lima")).toBeGreaterThan(
      mean("frederiksberg-pizza") + 0.5,
    )
  })

  it("has early and late pickups", () => {
    const waits = plan.orders
      .filter(({ outcome }) => outcome === "delivered")
      .map(
        ({ timeline }) =>
          (timeline.picked_up_at!.getTime() - timeline.ready_at!.getTime()) /
          MINUTE,
      )
    expect(waits.some((wait) => wait < 2)).toBe(true)
    expect(
      waits.filter((wait) => wait > 15).length / waits.length,
    ).toBeGreaterThan(0.05)
  })

  it("pauses one Restaurant for five days of the middle month, with no Orders then", () => {
    const paused = plan.restaurants.find(
      ({ key }) => key === PAUSED_RESTAURANT_KEY,
    )!
    expect(paused.changes.map(({ kind }) => kind)).toEqual([
      "activated",
      "deactivated",
      "activated",
    ])
    expect(paused.paused_dates).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ])
    expect(
      plan.orders.some(
        (order) =>
          order.restaurant === PAUSED_RESTAURANT_KEY &&
          paused.paused_dates.includes(dateOf(order)),
      ),
    ).toBe(false)
    expect(
      plan.restaurants.every(({ created_at }) => created_at < plan.from),
    ).toBe(true)
  })

  it("has a few legacy Orders and missing pickup times, in the first days only", () => {
    const legacy = plan.orders.filter(({ legacy }) => legacy)
    const missing = plan.orders.filter(({ missing_pickup }) => missing_pickup)
    expect(legacy.length).toBeGreaterThan(0)
    expect(missing.length).toBeGreaterThan(0)
    expect(legacy.length + missing.length).toBeLessThan(
      plan.orders.length * 0.01,
    )
    expect(
      [...legacy, ...missing].every((order) => dateOf(order) <= "2026-09-03"),
    ).toBe(true)
  })

  it("ends history ten minutes before now", () => {
    expect(
      plan.orders.every(
        ({ timeline }) => lastMomentOf(timeline) <= now.getTime() - 10 * MINUTE,
      ),
    ).toBe(true)
    expect(plan.orders.some((order) => dateOf(order) === "2026-11-28")).toBe(
      true,
    )
  })

  it("has Customers order only where they live inside the delivery area", () => {
    const customers = new Map(
      plan.customers.map((customer) => [customer.key, customer]),
    )
    const restaurants = new Map(DEMO_WORLD_RESTAURANTS.map((r) => [r.key, r]))
    for (const order of plan.orders)
      expect(
        restaurants
          .get(order.restaurant)!
          .delivery_area.includes(customers.get(order.customer)!.postal_code),
      ).toBe(true)
    for (const customer of plan.customers)
      expect(STREETS[customer.postal_code].city).toBe(customer.city)
  })

  it("adds a fresh now: every Open stage, waiting work, attention and owed refunds", () => {
    const kinds = plan.now_orders.map(({ kind }) => kind)
    expect(new Set(kinds)).toEqual(
      new Set([
        "awaiting_acceptance",
        "preparing",
        "ready_unassigned_waiting",
        "assigned_not_picked_up",
        "picked_up",
        "in_transit_stalled",
        "reported_problem",
        "failed_refund",
        "pending_refund",
      ]),
    )
    const waiting = plan.now_orders.find(
      ({ kind }) => kind === "ready_unassigned_waiting",
    )!
    expect(waiting.timeline.claimed_at).toBeUndefined()
    expect(
      now.getTime() - waiting.timeline.accepted_at!.getTime(),
    ).toBeGreaterThan(10 * MINUTE)
    // Inside the 30-minute claim window, so it is not cancelled yet.
    expect(
      now.getTime() - waiting.timeline.accepted_at!.getTime(),
    ).toBeLessThan(30 * MINUTE)
    const stalled = plan.now_orders.find(
      ({ kind }) => kind === "in_transit_stalled",
    )!
    expect(
      now.getTime() - stalled.timeline.picked_up_at!.getTime(),
    ).toBeGreaterThan(30 * MINUTE)
    for (const awaiting of plan.now_orders.filter(
      ({ kind }) => kind === "awaiting_acceptance",
    ))
      expect(
        now.getTime() - awaiting.timeline.placed_at.getTime(),
      ).toBeLessThan(5 * MINUTE)
    expect(
      plan.now_orders.every(({ slot }) => slot.startsWith(NOW_SLOT_PREFIX)),
    ).toBe(true)

    const later = planDemoWorld({
      now: new Date(now.getTime() + 2 * 60 * MINUTE),
      email_domain: DOMAIN,
    })
    const slots = new Set(plan.now_orders.map(({ slot }) => slot))
    expect(later.now_orders.some(({ slot }) => slots.has(slot))).toBe(false)
  })

  it("puts every login on the team's domain, unique and real-looking", () => {
    const emails = [
      ...plan.customers.map(({ email }) => email),
      ...plan.agents.map(({ email }) => email),
      ...plan.staff.map(({ email }) => email),
    ]
    expect(emails.every((email) => email.endsWith(`@${DOMAIN}`))).toBe(true)
    expect(new Set(emails).size).toBe(emails.length)
    expect(emails.every((email) => /^[a-z0-9.]+@/.test(email))).toBe(true)
    expect(plan.staff).toHaveLength(DEMO_WORLD_RESTAURANTS.length)
  })

  it("says nothing synthetic, demo, test or example anywhere visible", () => {
    const visible = JSON.stringify({
      restaurants: DEMO_WORLD_RESTAURANTS,
      customers: plan.customers,
      agents: plan.agents,
      staff: plan.staff,
      notes: plan.orders.map(({ note }) => note),
    })
    expect(visible).not.toMatch(
      /synthetic|syntetisk|demo|example|\btest\b|seed/i,
    )
  })

  it("plans the same world for the same now", () => {
    const again = planDemoWorld({ now, email_domain: DOMAIN })
    expect(again.orders).toEqual(plan.orders)
    expect(again.customers).toEqual(plan.customers)
  })

  it("keeps every seeded day the same on a rerun, adding only what has passed since", () => {
    const later = planDemoWorld({
      now: new Date(now.getTime() + 3 * 60 * MINUTE),
      email_domain: DOMAIN,
    })
    const bySlot = new Map(later.orders.map((order) => [order.slot, order]))
    for (const order of plan.orders) {
      const again = bySlot.get(order.slot)
      expect(again).toBeDefined()
      expect({ ...again, rating: undefined }).toEqual({
        ...order,
        rating: undefined,
      })
      if (order.rating) expect(again!.rating).toEqual(order.rating)
    }
    expect(later.orders.length).toBeGreaterThan(plan.orders.length)
  })
})

describe("demo world size and retiming (#258)", () => {
  it("seeds about 3,800 Orders, most at the prime Restaurants", () => {
    expect(plan.orders.length).toBeGreaterThan(3200)
    expect(plan.orders.length).toBeLessThan(4400)
    const primes = new Set(
      DEMO_WORLD_RESTAURANTS.filter(({ prime }) => prime).map(({ key }) => key),
    )
    const atPrimes = plan.orders.filter(({ restaurant }) =>
      primes.has(restaurant),
    )
    expect(atPrimes.length / plan.orders.length).toBeGreaterThan(0.55)
  })

  it("puts every recorded milestone on its planned time, whatever order the clock recorded them in", () => {
    const at = (iso: string) => new Date(iso)
    const retime = retimerNearest([
      // The host clock stepped back: acceptance was recorded before placement.
      {
        recorded: at("2026-11-28T08:00:01.500Z"),
        planned: at("2026-09-01T10:00:00Z"),
      },
      {
        recorded: at("2026-11-28T08:00:00.900Z"),
        planned: at("2026-09-01T10:02:00Z"),
      },
      {
        recorded: at("2026-11-28T08:00:02.000Z"),
        planned: at("2026-09-01T10:40:00Z"),
      },
    ])
    expect(retime(at("2026-11-28T08:00:00.900Z")).toISOString()).toBe(
      "2026-09-01T10:02:00.000Z",
    )
    expect(retime(at("2026-11-28T08:00:02.000Z")).toISOString()).toBe(
      "2026-09-01T10:40:00.000Z",
    )
    // A deadline keeps its distance from the nearest milestone.
    expect(retime(at("2026-11-28T08:05:02.000Z")).toISOString()).toBe(
      "2026-09-01T10:45:00.000Z",
    )
  })
})

describe("An earlier run's delivered now Order", () => {
  const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE)
  // Seeded as live work at -300 minutes, delivered by a rerun at -5.
  const recorded = {
    order_id: "order_01LEFTOVER",
    placed_at: at(-330),
    accepted_at: at(-327),
    claimed_at: at(-326),
    preparation_started_at: at(-324),
    ready_at: at(-305),
    picked_up_at: at(-300),
    handed_over_at: at(-5),
  }
  const transitOf = (timeline: ReturnType<typeof settledNowTimeline>) =>
    (timeline.handed_over_at!.getTime() - timeline.picked_up_at!.getTime()) /
    MINUTE

  it("keeps the milestones it had and hands over 7 to 24 minutes after its pickup", () => {
    const timeline = settledNowTimeline(recorded, now)
    expect(timeline).toMatchObject({
      placed_at: recorded.placed_at,
      accepted_at: recorded.accepted_at,
      claimed_at: recorded.claimed_at,
      preparation_started_at: recorded.preparation_started_at,
      ready_at: recorded.ready_at,
      picked_up_at: recorded.picked_up_at,
    })
    expect(transitOf(timeline)).toBeGreaterThanOrEqual(7)
    expect(transitOf(timeline)).toBeLessThanOrEqual(24)
  })

  it("moves a ready and pickup the rerun recorded hours late to just after preparation", () => {
    const timeline = settledNowTimeline(
      {
        ...recorded,
        ready_at: at(-6),
        picked_up_at: at(-5),
        handed_over_at: at(-5),
      },
      now,
    )
    expect(timeline.ready_at).toEqual(at(-309))
    expect(timeline.picked_up_at).toEqual(at(-305))
    expect(transitOf(timeline)).toBeGreaterThanOrEqual(7)
  })

  it("is settled already when run again, so a rerun changes nothing", () => {
    const once = settledNowTimeline(recorded, now)
    const again = settledNowTimeline(
      {
        ...recorded,
        ready_at: once.ready_at!,
        picked_up_at: once.picked_up_at!,
        handed_over_at: once.handed_over_at!,
      },
      now,
    )
    expect(again).toEqual(once)
  })

  it("never plans a handover after now", () => {
    const timeline = settledNowTimeline(
      {
        ...recorded,
        preparation_started_at: at(-3),
        ready_at: at(-1),
        picked_up_at: at(-1),
        handed_over_at: at(-1),
      },
      now,
    )
    expect(timeline.handed_over_at!.getTime()).toBeLessThanOrEqual(
      now.getTime(),
    )
    expect(timeline.picked_up_at!.getTime()).toBeLessThanOrEqual(
      timeline.handed_over_at!.getTime(),
    )
  })
})
