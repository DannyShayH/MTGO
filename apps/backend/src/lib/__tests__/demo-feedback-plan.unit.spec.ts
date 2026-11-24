import { FEEDBACK_WINDOW_MS } from "../../workflows/feedback/rules"
import {
  isPoorFoodFromGoodAgent,
  isSeededSlotKept,
  planDemoFeedback,
  type DemoSlot,
} from "../demo-feedback-plan"

const HOUR = 60 * 60 * 1000

describe("demo Feedback seed plan (#220)", () => {
  const now = new Date("2026-11-24T12:00:00Z")
  const plan = planDemoFeedback({ now, restaurants: 4, agents: 5 })

  it.each([
    {
      now: "2026-11-24T12:00:00Z",
      from: "2026-09-30T22:00:00.000Z",
      reason: "EP: the previous month starts in summer time (UTC+2)",
    },
    {
      now: "2026-04-10T08:00:00Z",
      from: "2026-02-28T23:00:00.000Z",
      reason: "EP: the previous month starts in winter time (UTC+1)",
    },
    {
      now: "2027-01-01T00:30:00Z",
      from: "2026-11-30T23:00:00.000Z",
      reason:
        "BVA: just after midnight on 1 January in Copenhagen, still 31 December in UTC",
    },
  ])("spreads over the last two calendar months: $reason", (example) => {
    expect(
      planDemoFeedback({
        now: new Date(example.now),
        restaurants: 2,
        agents: 2,
      }).from.toISOString(),
    ).toBe(example.from)
  })

  it("rates 500 Orders handed over in both months, each rated inside its window", () => {
    expect(plan.rated).toHaveLength(500)
    const octoberStart = new Date("2026-09-30T22:00:00Z")
    const novemberStart = new Date("2026-10-31T23:00:00Z")
    for (const order of plan.rated) {
      expect(order.delivered_at >= octoberStart).toBe(true)
      expect(order.delivered_at < now).toBe(true)
      expect(order.rated_at > order.delivered_at).toBe(true)
      expect(order.rated_at <= now).toBe(true)
      expect(
        order.rated_at.getTime() - order.delivered_at.getTime(),
      ).toBeLessThan(FEEDBACK_WINDOW_MS)
    }
    const inNovember = plan.rated.filter(
      ({ delivered_at }) => delivered_at >= novemberStart,
    ).length
    expect(inNovember).toBeGreaterThan(100)
    expect(500 - inNovember).toBeGreaterThan(100)
  })

  it("spreads the Orders over every Restaurant and agent", () => {
    expect(new Set(plan.rated.map(({ restaurant }) => restaurant))).toEqual(
      new Set([0, 1, 2, 3]),
    )
    expect(new Set(plan.rated.map(({ agent }) => agent))).toEqual(
      new Set([0, 1, 2, 3, 4]),
    )
  })

  it("varies the ratings, including poor food from a five-star agent", () => {
    for (const kind of [
      "food_rating",
      "experience_rating",
      "agent_rating",
    ] as const)
      expect(new Set(plan.rated.map((order) => order[kind]))).toEqual(
        new Set([1, 2, 3, 4, 5]),
      )
    // Food rated 1 or 2 by an Order whose agent was rated 5 (the boundaries
    // are pinned by the table below).
    const poorFoodGoodAgent = plan.rated.filter(isPoorFoodFromGoodAgent)
    expect(poorFoodGoodAgent.length).toBeGreaterThanOrEqual(10)
    for (const restaurant of [0, 1, 2, 3])
      expect(
        poorFoodGoodAgent.filter((order) => order.restaurant === restaurant)
          .length,
      ).toBeGreaterThanOrEqual(3)
    const foodAverage = (restaurant: number) => {
      const ratings = plan.rated
        .filter((order) => order.restaurant === restaurant)
        .map(({ food_rating }) => food_rating)
      return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    }
    const averages = [0, 1, 2, 3].map(foodAverage)
    expect(Math.max(...averages) - Math.min(...averages)).toBeGreaterThan(0.5)
  })

  it.each([
    { food: 2, agent: 5, isContrast: true, reason: "BVA: highest poor food" },
    { food: 3, agent: 5, isContrast: false, reason: "BVA: food not poor" },
    {
      food: 1,
      agent: 4,
      isContrast: false,
      reason: "BVA: agent not five-star",
    },
  ])(
    "names the poor-food, five-star-agent contrast: $reason",
    ({ food, agent, isContrast }) => {
      expect(
        isPoorFoodFromGoodAgent({
          ...plan.rated[0],
          food_rating: food,
          agent_rating: agent,
        }),
      ).toBe(isContrast)
    },
  )

  it("adds one unrated Order still open for rating and one whose window has closed", () => {
    expect(plan.open.delivered_at.getTime()).toBe(now.getTime() - 48 * HOUR)
    expect(plan.closed.delivered_at.getTime()).toBe(
      now.getTime() - 9 * 24 * HOUR,
    )
    expect(now.getTime() - plan.closed.delivered_at.getTime()).toBeGreaterThan(
      FEEDBACK_WINDOW_MS,
    )
    expect(plan.open).not.toHaveProperty("food_rating")
    expect(plan.closed).not.toHaveProperty("food_rating")
  })

  describe("a second run keeps a seeded Order only while it still shows its state", () => {
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * HOUR)
    it.each<{
      slot: DemoSlot
      delivered_at: Date | null
      isRated: boolean
      isKept: boolean
      reason: string
    }>([
      {
        slot: "rated-7",
        delivered_at: daysAgo(20),
        isRated: true,
        isKept: true,
        reason: "DT: a rated Order stays rated",
      },
      {
        slot: "rated-7",
        delivered_at: daysAgo(20),
        isRated: false,
        isKept: false,
        reason: "DT: an interrupted Order was delivered but never rated",
      },
      {
        slot: "rated-7",
        delivered_at: null,
        isRated: false,
        isKept: false,
        reason: "DT: an interrupted Order was never delivered",
      },
      {
        slot: "closed",
        delivered_at: daysAgo(9),
        isRated: false,
        isKept: true,
        reason: "DT: the closed window stays closed",
      },
      {
        slot: "open",
        delivered_at: daysAgo(2),
        isRated: false,
        isKept: true,
        reason: "DT: the open Order can still be rated",
      },
      {
        slot: "open",
        delivered_at: new Date(now.getTime() - FEEDBACK_WINDOW_MS + 1),
        isRated: false,
        isKept: true,
        reason: "BVA: one millisecond before the window closes",
      },
      {
        slot: "open",
        delivered_at: daysAgo(7),
        isRated: false,
        isKept: false,
        reason: "BVA: the window has closed at exactly 168 hours",
      },
      {
        slot: "open",
        delivered_at: daysAgo(2),
        isRated: true,
        isKept: false,
        reason: "DT: the Customer rated the open Order during a demo",
      },
    ])("$reason", ({ slot, delivered_at, isRated, isKept }) => {
      expect(isSeededSlotKept({ slot, delivered_at, isRated, now })).toBe(
        isKept,
      )
    })
  })
})
