import { copenhagenMidnight } from "../workflows/restaurant-finance/calculation"
import { seededRandom } from "./seeded-random"

const MINUTE = 60 * 1000

/** Copenhagen lunch and dinner handover times, minutes after midnight. */
const SERVICE_TIMES = [
  11 * 60 + 50,
  12 * 60 + 35,
  13 * 60 + 20,
  17 * 60 + 25,
  18 * 60 + 10,
  18 * 60 + 55,
  19 * 60 + 40,
  20 * 60 + 30,
]

/**
 * How big a demo basket is: one dish, two of one, a dinner for two, a family
 * order, or a rare catering order large enough to reach the higher
 * commission bands.
 */
export type DemoStatementBasket =
  "single" | "pair" | "dinner" | "family" | "catering"

export type PlannedStatementOrder = {
  /** `YYYY-MM-DD#n`: the date and its n-th Order, stable across runs. */
  slot: string
  date: string
  handover_at: Date
  basket: DemoStatementBasket
}

const basketOf = (roll: number): DemoStatementBasket => {
  if (roll < 0.04) return "catering"
  if (roll < 0.16) return "family"
  if (roll < 0.46) return "dinner"
  if (roll < 0.76) return "pair"
  return "single"
}

/**
 * The delivered demo Orders of one Restaurant's statement (#228): a few on
 * each of its active Copenhagen dates, at lunch and dinner, never at or
 * after `now` and never before `not_before` (its first recorded
 * activation), so every Order happened while it was active. Deterministic
 * per `seed`, so a rerun plans the same slots and creates only missing ones.
 */
export function planDemoStatementOrders(input: {
  seed: string
  active_dates: string[]
  not_before: Date
  now: Date
  per_day: { min: number; max: number }
}): PlannedStatementOrder[] {
  const orders: PlannedStatementOrder[] = []
  for (const date of input.active_dates) {
    const random = seededRandom(
      [...`${input.seed}:${date}`].reduce(
        (hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0,
        7,
      ),
    )
    const [year, month, day] = date.split("-").map(Number)
    const midnight = copenhagenMidnight(year, month, day).getTime()
    const count =
      input.per_day.min +
      Math.floor(random() * (input.per_day.max - input.per_day.min + 1))
    const times = [...SERVICE_TIMES]
      .sort(() => random() - 0.5)
      .slice(0, count)
      .sort((a, b) => a - b)
    times.forEach((minutes, index) => {
      const handover_at = new Date(
        midnight + minutes * MINUTE + Math.floor(random() * 20) * MINUTE,
      )
      const basket = basketOf(random())
      if (handover_at >= input.now || handover_at < input.not_before) return
      orders.push({ slot: `${date}#${index + 1}`, date, handover_at, basket })
    })
  }
  return orders
}
