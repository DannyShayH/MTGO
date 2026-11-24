import { FEEDBACK_WINDOW_MS } from "../workflows/feedback/rules"
import { seededRandom } from "./seeded-random"

const HOUR = 60 * 60 * 1000

const copenhagenParts = (at: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Copenhagen",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<"year" | "month" | "day" | "hour", number>

/**
 * 00:00 Copenhagen time on the 1st of the month before `now`'s month.
 * Midnight on the 1st is never a daylight-saving change, so it is UTC
 * midnight less one or two hours.
 */
function previousCopenhagenMonthStart(now: Date) {
  const { year, month } = copenhagenParts(now)
  const utcMidnight = Date.UTC(year, month - 2, 1)
  const offset = [1, 2].find((hours) => {
    const parts = copenhagenParts(new Date(utcMidnight - hours * HOUR))
    return parts.day === 1 && parts.hour === 0
  })!
  return new Date(utcMidnight - offset * HOUR)
}

export const DEMO_RATED_ORDERS = 500

/** Where each seeded Order sits: one of the rated Orders, or an unrated one. */
export type DemoSlot = `rated-${number}` | "open" | "closed"

/** A delivered demo Order: the demo Restaurant and agent by index. */
export type PlannedOrder = {
  restaurant: number
  agent: number
  delivered_at: Date
}

export type PlannedRatedOrder = PlannedOrder & {
  rated_at: Date
  food_rating: number
  experience_rating: number
  agent_rating: number
}

/** The contrast a demo shows: the food let down, the agent did not. */
export const isPoorFoodFromGoodAgent = (order: PlannedRatedOrder) =>
  order.food_rating <= 2 && order.agent_rating === 5

/** Usual quality from 4.5 for the first subject down to 3 for the last. */
const usualQuality = (index: number, count: number) =>
  4.5 - (1.5 * index) / Math.max(count - 1, 1)

/** A whole rating from 1 to 5 scattered around `mean`. */
function ratingAround(mean: number, random: () => number) {
  const scatter = (random() + random() + random() - 1.5) * 1.6
  return Math.min(5, Math.max(1, Math.round(mean + scatter)))
}

/**
 * Every 21st Order: poor food that a five-star agent delivered. Orders take
 * the Restaurants in turn, and 21 shares no factor with four Restaurants, so
 * these Orders reach each of them.
 */
const POOR_FOOD_GOOD_AGENT_EVERY = 21

/**
 * The same plan on every run with the same `now`: 500 rated Orders, one
 * handed over at a random time in each equal share of the span from the start
 * of the previous Copenhagen calendar month until an hour before `now`, each
 * rated 10 minutes to 47 hours after
 * its handover. Orders take the Restaurants in turn and draw an agent at
 * random. Ratings scatter around a usual quality that falls from the first
 * Restaurant or agent to the last, and every 21st Order is the poor-food,
 * five-star-agent contrast. Restaurants and agents are indexes into the
 * caller's lists.
 */
export function planDemoFeedback(input: {
  now: Date
  restaurants: number
  agents: number
}) {
  const random = seededRandom(220)
  const from = previousCopenhagenMonthStart(input.now)
  // Handovers end an hour before now, so even the newest was rated after it.
  const span = input.now.getTime() - HOUR - from.getTime()
  const interval = span / DEMO_RATED_ORDERS
  const rated: PlannedRatedOrder[] = []
  for (let index = 0; index < DEMO_RATED_ORDERS; index++) {
    const delivered = from.getTime() + (index + random()) * interval
    const ratedAfter = (10 / 60 + random() * 47) * HOUR
    const restaurant = index % input.restaurants
    const agent = Math.floor(random() * input.agents)
    const isContrast = index % POOR_FOOD_GOOD_AGENT_EVERY === 0
    const food_rating = isContrast
      ? 1 + Math.floor(random() * 2)
      : ratingAround(usualQuality(restaurant, input.restaurants), random)
    const agent_rating = isContrast
      ? 5
      : ratingAround(usualQuality(agent, input.agents), random)
    rated.push({
      restaurant,
      agent,
      food_rating,
      experience_rating: ratingAround((food_rating + agent_rating) / 2, random),
      agent_rating,
      delivered_at: new Date(delivered),
      rated_at: new Date(Math.min(delivered + ratedAfter, input.now.getTime())),
    })
  }
  return {
    from,
    rated,
    /** Handed over two days ago: the Customer can still rate it. */
    open: {
      restaurant: 0,
      agent: 0,
      delivered_at: new Date(input.now.getTime() - 48 * HOUR),
    } satisfies PlannedOrder,
    /** Handed over nine days ago without Feedback: the window has closed. */
    closed: {
      restaurant: 0,
      agent: 0,
      delivered_at: new Date(input.now.getTime() - 9 * 24 * HOUR),
    } satisfies PlannedOrder,
  }
}

/**
 * Whether a second run keeps a seeded Order: a rated slot once its Feedback
 * is recorded, the closed slot once delivered, and the open slot only while
 * it can still be rated, so each run leaves an Order to rate in a demo.
 */
export function isSeededSlotKept(input: {
  slot: DemoSlot
  /** The recorded handover; null when the Order was never delivered. */
  delivered_at: Date | null
  isRated: boolean
  now: Date
}) {
  if (input.slot.startsWith("rated-")) return input.isRated
  if (!input.delivered_at) return false
  if (input.slot === "closed") return true
  const closes = input.delivered_at.getTime() + FEEDBACK_WINDOW_MS
  return !input.isRated && input.now.getTime() < closes
}
