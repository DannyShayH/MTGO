import {
  addCopenhagenDays,
  copenhagenDateOf,
  copenhagenDayStart,
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../../workflows/shared/copenhagen-time"
import { seededRandom } from "../seeded-random"
import {
  shiftMonth,
  type PopulationOutcome,
  type PopulationTimeline,
} from "../statement-population-plan"
import {
  DEMO_WORLD_AGENTS,
  FIRST_NAMES,
  FLOORS,
  LAST_NAMES,
  OPERATOR_REASONS,
  REJECTION_NOTES,
  SHIFTS,
  STREETS,
} from "./people"
import {
  DEMO_WORLD_RESTAURANTS,
  PAUSED_RESTAURANT_KEY,
  type DemoDishRole,
  type DemoWorldRestaurant,
} from "./restaurants"

/**
 * The demo world (#258): a pure, deterministic plan of three Copenhagen
 * months of platform activity relative to the run time. Each Copenhagen day
 * of each Restaurant is planned from its own seed, so a rerun plans the days
 * it already seeded exactly as before and only adds the days, and the part
 * of today, that have passed since. The "now" Orders are planned from the
 * run time itself, so every run adds a fresh set.
 */

/** The metadata key on every seeded Order, Customer and agent. */
export const DEMO_WORLD_KEY = "demo_world_258"

/** Slots of the "now" Orders start with this, apart from history slots. */
export const NOW_SLOT_PREFIX = "now:"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export const DEMO_WORLD_CUSTOMER_COUNT = 400

export type DemoWorldOutcome = Exclude<PopulationOutcome, "delivered_late">

export type DemoWorldCustomer = {
  key: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address_1: string
  postal_code: string
  city: string
  /** Orders from regulars are five times as likely. */
  regular: boolean
}

export type DemoWorldAgent = {
  key: string
  name: string
  email: string
  phone: string
  shift: keyof typeof SHIFTS
  quality: number
}

export type DemoWorldStaff = {
  restaurant: string
  name: string
  email: string
}

export type DemoWorldRating = {
  food_rating: number
  experience_rating: number
  agent_rating: number
  rated_at: Date
}

export type DemoWorldOrder = {
  /** `YYYY-MM-DD:<restaurant>:<nn>` for history, `now:...` for now. */
  slot: string
  restaurant: string
  customer: string
  /** Index into the plan's agents; unused when no agent claims it. */
  agent: number
  outcome: DemoWorldOutcome
  basket: { dish: string; quantity: number }[]
  timeline: PopulationTimeline
  note?: string
  rating?: DemoWorldRating
  /** Placed before placements were recorded: no placement time. */
  legacy?: boolean
  /** Delivered without a recorded pickup time. */
  missing_pickup?: boolean
}

/** Where an Order of the "now" set stops, and what it shows. */
export type NowKind =
  | "awaiting_acceptance"
  | "preparing"
  | "ready_unassigned_waiting"
  | "assigned_not_picked_up"
  | "picked_up"
  | "in_transit_stalled"
  | "reported_problem"
  | "failed_refund"
  | "pending_refund"

export type DemoWorldNowOrder = Omit<DemoWorldOrder, "outcome"> & {
  kind: NowKind
  /** The outcome a refund case ends in; open Orders have none. */
  outcome?: "restaurant_rejected" | "customer_cancelled"
}

export type DemoWorldPlan = {
  now: Date
  /** Copenhagen midnight on the first day of the window. */
  from: Date
  /** The three statement months, oldest first; the last is the current. */
  months: string[]
  restaurants: {
    key: string
    created_at: Date
    changes: { kind: "activated" | "deactivated"; occurred_at: Date }[]
    /** Copenhagen dates on which it takes no Orders (its pause). */
    paused_dates: string[]
  }[]
  staff: DemoWorldStaff[]
  customers: DemoWorldCustomer[]
  agents: DemoWorldAgent[]
  orders: DemoWorldOrder[]
  now_orders: DemoWorldNowOrder[]
}

/** How often each unfulfilled outcome happens; the rest are delivered. */
export const UNFULFILLED_SHARES: Record<
  Exclude<DemoWorldOutcome, "delivered">,
  number
> = {
  customer_cancelled: 0.012,
  restaurant_rejected: 0.012,
  acceptance_timeout: 0.008,
  unassigned_timeout: 0.007,
  operator_cancelled: 0.008,
}

/** Busier weekends: Sunday (0) to Saturday (6). */
const WEEKDAY_FACTOR = [1.25, 0.8, 0.85, 0.9, 1, 1.35, 1.45]

/** The share of delivered Orders the Customer rates. */
const RATED_SHARE = 0.55

const hashOf = (text: string) =>
  [...text].reduce(
    (hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0,
    7,
  )

/** Lower-case ASCII for email local parts: æ, ø, å and accents folded. */
export const asciiOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")

function randomTools(random: () => number) {
  const between = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1))
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)]
  const weighted = <T>(items: readonly T[], weight: (item: T) => number) => {
    const total = items.reduce((sum, item) => sum + weight(item), 0)
    let roll = random() * total
    return items.find((item) => (roll -= weight(item)) < 0) ?? items.at(-1)!
  }
  return { between, pick, weighted }
}

/** A whole rating from 1 to 5 scattered around `mean`. */
function ratingAround(mean: number, random: () => number) {
  const scatter = (random() + random() + random() - 1.5) * 1.6
  return Math.min(5, Math.max(1, Math.round(mean + scatter)))
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

/** The window's first day: the first of the month two months before now. */
export function demoWorldWindow(now: Date) {
  const current = copenhagenMonthOf(now)
  const months = [shiftMonth(current, -2), shiftMonth(current, -1), current]
  return { months, from: copenhagenMonthPeriod(months[0]).starts_at }
}

/** People: staff, agents and Customers, with unique real-looking emails. */
function planPeople(email_domain: string) {
  const random = seededRandom(hashOf(`${DEMO_WORLD_KEY}:people`))
  const { between, pick } = randomTools(random)
  const emails = new Set<string>()
  const phones = new Set<string>()
  const uniqueEmail = (local: string) => {
    let candidate = local
    let suffix = 1
    while (emails.has(candidate)) {
      suffix++
      candidate = `${local}${suffix}`
    }
    emails.add(candidate)
    return `${candidate}@${email_domain}`
  }
  const phone = () => {
    let candidate: string
    do
      candidate = `+45${pick(["2", "3", "4", "5", "6", "7", "8"])}${String(between(0, 9999999)).padStart(7, "0")}`
    while (phones.has(candidate))
    phones.add(candidate)
    return candidate
  }
  const staff: DemoWorldStaff[] = DEMO_WORLD_RESTAURANTS.map((restaurant) => ({
    restaurant: restaurant.key,
    name: `${restaurant.staff.first_name} ${restaurant.staff.last_name}`,
    email: uniqueEmail(
      `${asciiOf(restaurant.staff.first_name)}.${asciiOf(restaurant.staff.last_name)}`,
    ),
  }))
  const agents: DemoWorldAgent[] = DEMO_WORLD_AGENTS.map((agent, index) => ({
    key: `agent-${String(index + 1).padStart(2, "0")}`,
    name: `${agent.first_name} ${agent.last_name}`,
    email: uniqueEmail(
      `${asciiOf(agent.first_name)}.${asciiOf(agent.last_name)}`,
    ),
    phone: phone(),
    shift: agent.shift,
    quality: agent.quality,
  }))
  // Customers live where the Restaurants deliver, more where more deliver.
  const codes = DEMO_WORLD_RESTAURANTS.flatMap(
    ({ delivery_area }) => delivery_area,
  )
  const names = new Set([
    ...staff.map(({ name }) => name),
    ...agents.map(({ name }) => name),
  ])
  const customers: DemoWorldCustomer[] = []
  while (customers.length < DEMO_WORLD_CUSTOMER_COUNT) {
    const first_name = pick(FIRST_NAMES)
    const last_name = pick(LAST_NAMES)
    if (names.has(`${first_name} ${last_name}`)) continue
    names.add(`${first_name} ${last_name}`)
    const first = asciiOf(first_name)
    const last = asciiOf(last_name)
    const local = [
      `${first}.${last}`,
      `${first[0]}${last}`,
      `${first}${last}${between(60, 99)}`,
      `${first}.${last[0]}`,
      `${first}${between(1, 9)}${last}`,
    ][between(0, 4)]
    const postal_code = pick(codes)
    const area = STREETS[postal_code]
    const floor = random() < 0.65 ? `, ${pick(FLOORS)}` : ""
    customers.push({
      key: `customer-${String(customers.length + 1).padStart(3, "0")}`,
      first_name,
      last_name,
      email: uniqueEmail(local),
      phone: phone(),
      address_1: `${pick(area.streets)} ${between(1, 160)}${floor}`,
      postal_code,
      city: area.city,
      regular: random() < 0.2,
    })
  }
  return { staff, agents, customers }
}

/**
 * The pause of the paused Restaurant: five days in the middle month of the
 * window, deactivated in the morning of the first and activated again in
 * the morning after the last.
 */
function pauseOf(months: string[]) {
  const start = `${months[1]}-10`
  const dates = [0, 1, 2, 3, 4].map((days) => addCopenhagenDays(start, days))
  return {
    dates,
    deactivated_at: new Date(copenhagenDayStart(dates[0]).getTime() + 7 * HOUR),
    activated_at: new Date(
      copenhagenDayStart(addCopenhagenDays(dates[4], 1)).getTime() + 7 * HOUR,
    ),
  }
}

/** The minute of the day an Order is handed over (or placed, if cancelled). */
function serviceMinute(restaurant: DemoWorldRestaurant, random: () => number) {
  const windows = [
    { share: 0.35, start: 11 * 60, end: 13 * 60 + 30 },
    { share: 0.55, start: 17 * 60, end: 20 * 60 + 30 },
    { share: 0.1, start: restaurant.opens, end: restaurant.closes },
  ]
    .map((window) => ({
      ...window,
      // The first handovers come once the kitchen has had time to cook.
      start: Math.max(window.start, restaurant.opens + 90),
      end: Math.min(window.end, restaurant.closes),
    }))
    .filter(({ start, end }) => end > start)
  const total = windows.reduce((sum, { share }) => sum + share, 0)
  let roll = random() * total
  const window = windows.find(({ share }) => (roll -= share) < 0) ?? windows[0]
  // Two draws peak in the middle of the service.
  const share = (random() + random()) / 2
  return Math.round(window.start + share * (window.end - window.start))
}

/**
 * The milestones of one Order around its service moment, as the real
 * workflows record them. Delivered: the handover is at the moment, and the
 * pickup sometimes waits long after the food is ready. Cancelled: placed at
 * the moment.
 */
export function timelineOf(
  outcome: DemoWorldOutcome,
  moment: number,
  between: (min: number, max: number) => number,
): PopulationTimeline {
  const at = (time: number) => new Date(time)
  const minutes = (min: number, max: number) =>
    between(min * 60, max * 60) * 1000
  if (outcome === "delivered") {
    const handedOver = moment
    const pickedUp = handedOver - minutes(7, 24)
    const latePickup = between(0, 9) === 0
    const ready = pickedUp - (latePickup ? minutes(15, 32) : minutes(0.5, 9))
    const preparation = ready - minutes(10, 30)
    const accepted = preparation - minutes(1, 4)
    const claimed = accepted + minutes(0.5, 3)
    return {
      placed_at: at(accepted - minutes(0.5, 4)),
      accepted_at: at(accepted),
      claimed_at: at(Math.min(claimed, ready - 30 * 1000)),
      preparation_started_at: at(preparation),
      ready_at: at(ready),
      picked_up_at: at(pickedUp),
      handed_over_at: at(handedOver),
    }
  }
  const placed = moment
  if (outcome === "customer_cancelled" || outcome === "restaurant_rejected")
    return { placed_at: at(placed), cancelled_at: at(placed + minutes(1, 4)) }
  if (outcome === "acceptance_timeout") {
    const deadline = placed + 5 * MINUTE
    return {
      placed_at: at(placed),
      deadline_at: at(deadline),
      cancelled_at: at(deadline + between(15, 55) * 1000),
    }
  }
  const accepted = placed + minutes(1, 4)
  if (outcome === "unassigned_timeout") {
    const deadline = accepted + 30 * MINUTE
    return {
      placed_at: at(placed),
      accepted_at: at(accepted),
      preparation_started_at: at(accepted + minutes(2, 6)),
      deadline_at: at(deadline),
      cancelled_at: at(deadline + between(15, 55) * 1000),
    }
  }
  const claimed = accepted + minutes(1, 3)
  const preparation = claimed + minutes(1, 4)
  const ready = between(0, 1) ? preparation + minutes(12, 20) : undefined
  return {
    placed_at: at(placed),
    accepted_at: at(accepted),
    claimed_at: at(claimed),
    preparation_started_at: at(preparation),
    ...(ready ? { ready_at: at(ready) } : {}),
    cancelled_at: at((ready ?? preparation) + minutes(3, 12)),
  }
}

/** The latest planned time of a timeline: what must lie in the past. */
export const lastMomentOf = (timeline: PopulationTimeline) =>
  Math.max(
    ...Object.values(timeline)
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime()),
  )

/**
 * A basket: one to four mains, often with a side, drinks or a dessert, now
 * and then a large office order. Repeated dishes merge into one line.
 */
function basketOf(restaurant: DemoWorldRestaurant, random: () => number) {
  const { pick } = randomTools(random)
  const dishes = restaurant.menu.flatMap(({ dishes }) => dishes)
  const lines = new Map<string, number>()
  const add: AddDish = (role, quantity) => {
    const options = dishes.filter((candidate) => candidate.role === role)
    if (!options.length || quantity < 1) return
    const chosen = pick(options).key
    lines.set(chosen, (lines.get(chosen) ?? 0) + quantity)
  }
  const roll = random()
  if (roll < 0.03) officeBasket(add, random)
  else everydayBasket(add, roll, random)
  // A Restaurant without mains (or an empty pick) still sells something.
  if (!lines.size) lines.set(dishes[0].key, 1)
  return [...lines].map(([dish, quantity]) => ({ dish, quantity }))
}

type AddDish = (role: DemoDishRole, quantity: number) => void

/** An office order: several mains of each kind, sides and many drinks. */
function officeBasket(add: AddDish, random: () => number) {
  const { between } = randomTools(random)
  for (let main = 0; main < between(3, 4); main++) add("main", between(2, 3))
  add("side", between(2, 4))
  add("drink", between(4, 8))
}

/** One to four mains, now and then with a side, drinks or a dessert. */
function everydayBasket(add: AddDish, roll: number, random: () => number) {
  const { between } = randomTools(random)
  let mains = 1
  if (roll < 0.15) mains = between(3, 4)
  else if (roll < 0.5) mains = 2
  for (let main = 0; main < mains; main++) add("main", 1)
  if (random() < 0.45) add("side", mains > 1 ? between(1, 2) : 1)
  if (random() < 0.6) add("drink", between(1, mains))
  if (random() < 0.25) add("dessert", between(1, 2))
}

function outcomeOf(random: () => number): DemoWorldOutcome {
  let roll = random()
  for (const [outcome, share] of Object.entries(UNFULFILLED_SHARES)) {
    if ((roll -= share) < 0) return outcome as DemoWorldOutcome
  }
  return "delivered"
}

/** Agents on shift for a service on a date, or everyone if nobody is. */
function agentsOnShift(agents: DemoWorldAgent[], date: string, lunch: boolean) {
  const day = weekdayOf(date)
  const on = agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => {
      const shift = SHIFTS[agent.shift]
      return shift.days.includes(day) && (lunch ? shift.lunch : shift.dinner)
    })
  return on.length ? on : agents.map((agent, index) => ({ agent, index }))
}

/** Created before the window and active from then; one Restaurant pauses. */
function planParticipation(from: Date, pause: ReturnType<typeof pauseOf>) {
  return DEMO_WORLD_RESTAURANTS.map((restaurant) => {
    const created_at = new Date(from.getTime() - 3 * 24 * HOUR + 9 * HOUR)
    const activated = new Date(created_at.getTime() + HOUR)
    const isPaused = restaurant.key === PAUSED_RESTAURANT_KEY
    const pauseChanges = [
      { kind: "deactivated" as const, occurred_at: pause.deactivated_at },
      { kind: "activated" as const, occurred_at: pause.activated_at },
    ]
    return {
      key: restaurant.key,
      created_at,
      changes: [
        { kind: "activated" as const, occurred_at: activated },
        ...(isPaused ? pauseChanges : []),
      ],
      paused_dates: isPaused ? pause.dates : [],
    }
  })
}

/** Each Restaurant's possible Customers: those inside its delivery area. */
const customersByRestaurant = (customers: DemoWorldCustomer[]) =>
  new Map(
    DEMO_WORLD_RESTAURANTS.map((restaurant) => [
      restaurant.key,
      customers.filter(({ postal_code }) =>
        restaurant.delivery_area.includes(postal_code),
      ),
    ]),
  )

type DayContext = {
  agents: DemoWorldAgent[]
  customersOf: Map<string, DemoWorldCustomer[]>
  /** Orders whose last milestone is later than this are not history yet. */
  latest: number
  /** The first Copenhagen date after the window's first three days. */
  firstDaysEnd: string
}

/** One Restaurant's Orders on one Copenhagen date, from that day's own seed. */
function planDay(
  restaurant: DemoWorldRestaurant,
  date: string,
  scale: number,
  context: DayContext,
) {
  const random = seededRandom(
    hashOf(`${DEMO_WORLD_KEY}:${date}:${restaurant.key}`),
  )
  const mean =
    restaurant.orders_per_day * WEEKDAY_FACTOR[weekdayOf(date)] * scale
  const count = Math.max(
    0,
    Math.round(mean + (random() - 0.5) * Math.max(1, mean * 0.4)),
  )
  const orders: DemoWorldOrder[] = []
  for (let number = 1; number <= count; number++) {
    const order = drawOrder(restaurant, date, number, random, context)
    if (order) orders.push(order)
  }
  return orders
}

/**
 * One Order: every draw is made, in a fixed order, before an Order still in
 * the future is skipped, so a day plans the same Orders whatever time it is.
 */
function drawOrder(
  restaurant: DemoWorldRestaurant,
  date: string,
  number: number,
  random: () => number,
  context: DayContext,
): DemoWorldOrder | null {
  const { between, weighted } = randomTools(random)
  const minute = serviceMinute(restaurant, random)
  const moment =
    copenhagenDayStart(date).getTime() + minute * MINUTE + between(0, 59) * 1000
  const outcome = outcomeOf(random)
  const timeline = timelineOf(outcome, moment, between)
  const shift = agentsOnShift(context.agents, date, minute < 15 * 60)
  const { agent, index: agentIndex } = weighted(shift, () => 1)
  const customer = weighted(
    context.customersOf.get(restaurant.key)!,
    ({ regular }) => (regular ? 5 : 1),
  )
  const basket = basketOf(restaurant, random)
  const draws = drawDetails(restaurant, agent, random)
  if (lastMomentOf(timeline) > context.latest) return null
  const order: DemoWorldOrder = {
    slot: `${date}:${restaurant.key}:${String(number).padStart(2, "0")}`,
    restaurant: restaurant.key,
    customer: customer.key,
    agent: agentIndex,
    outcome,
    basket,
    timeline,
  }
  if (outcome === "restaurant_rejected") order.note = draws.rejection
  if (outcome === "operator_cancelled") order.note = draws.reason
  if (outcome === "delivered")
    Object.assign(
      order,
      deliveredDetails(timeline, draws, date < context.firstDaysEnd, context),
    )
  return order
}

/** The draws every Order makes, whether or not its outcome uses them. */
function drawDetails(
  restaurant: DemoWorldRestaurant,
  agent: DemoWorldAgent,
  random: () => number,
) {
  const { between } = randomTools(random)
  const roll = random()
  const ratingRoll = random()
  const ratedAfter = (10 / 60 + random() * random() * 47) * HOUR
  // Now and then a bad evening: the food, or the delivery, let down.
  const badFood = random() < 0.03
  const badAgent = random() < 0.02
  const food_rating = badFood
    ? 1 + Math.floor(random() * 2)
    : ratingAround(restaurant.food_quality, random)
  const agent_rating = badAgent ? 1 : ratingAround(agent.quality, random)
  const experience_rating = ratingAround(
    (food_rating + agent_rating) / 2,
    random,
  )
  return {
    roll,
    ratingRoll,
    ratedAfter,
    ratings: { food_rating, agent_rating, experience_rating },
    rejection: REJECTION_NOTES[between(0, REJECTION_NOTES.length - 1)],
    reason: OPERATOR_REASONS[between(0, OPERATOR_REASONS.length - 1)],
  }
}

/** A delivered Order's rating, if given by now, and its rare old records. */
function deliveredDetails(
  timeline: PopulationTimeline,
  draws: ReturnType<typeof drawDetails>,
  isFirstDays: boolean,
  context: DayContext,
): Pick<DemoWorldOrder, "rating" | "legacy" | "missing_pickup"> {
  const handover = timeline.handed_over_at!.getTime()
  const rated_at = handover + draws.ratedAfter
  const rating =
    draws.ratingRoll < RATED_SHARE && rated_at < context.latest
      ? { rating: { ...draws.ratings, rated_at: new Date(rated_at) } }
      : {}
  if (isFirstDays && draws.roll < 0.04) return { ...rating, legacy: true }
  if (isFirstDays && draws.roll < 0.08)
    return { ...rating, missing_pickup: true }
  return rating
}

/**
 * The same plan on every run at the same `now`, and the same history days
 * at any later `now`. `scale` multiplies every Restaurant's daily volume, so
 * a trial run can measure the time per Order before the size is fixed.
 */
export function planDemoWorld(input: {
  now: Date
  email_domain: string
  scale?: number
}): DemoWorldPlan {
  const { now, email_domain } = input
  const scale = input.scale ?? 1
  const { months, from } = demoWorldWindow(now)
  const { staff, agents, customers } = planPeople(email_domain)

  const restaurants = planParticipation(from, pauseOf(months))
  const context: DayContext = {
    agents,
    customersOf: customersByRestaurant(customers),
    // History ends 10 minutes before now; the "now" set covers the present.
    latest: now.getTime() - 10 * MINUTE,
    firstDaysEnd: addCopenhagenDays(copenhagenDateOf(from), 3),
  }
  const today = copenhagenDateOf(now)
  const orders: DemoWorldOrder[] = []
  for (
    let date = copenhagenDateOf(from);
    date <= today;
    date = addCopenhagenDays(date, 1)
  )
    for (const [index, restaurant] of DEMO_WORLD_RESTAURANTS.entries())
      if (!restaurants[index].paused_dates.includes(date))
        orders.push(...planDay(restaurant, date, scale, context))
  orders.sort(
    (a, b) => a.timeline.placed_at.getTime() - b.timeline.placed_at.getTime(),
  )

  return {
    now,
    from,
    months,
    restaurants,
    staff,
    customers,
    agents,
    orders,
    now_orders: planNowOrders(now, customers, agents),
  }
}

/**
 * The present: Open Orders in every stage, an unassigned delivery waiting
 * over ten minutes, stalled deliveries and a reported problem that raise
 * attention items, and pending and failed Full refunds. Keyed by the run's
 * minute, so each run adds a fresh set. The seed plans it again just before
 * seeding it, so its times are relative to that moment.
 */
export function planNowOrders(
  now: Date,
  customers: DemoWorldCustomer[],
  agents: DemoWorldAgent[],
): DemoWorldNowOrder[] {
  const customersOf = customersByRestaurant(customers)
  const stamp = now.toISOString().slice(0, 16)
  const random = seededRandom(hashOf(`${DEMO_WORLD_KEY}:now:${stamp}`))
  const { pick } = randomTools(random)
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE)
  const byKey = new Map(DEMO_WORLD_RESTAURANTS.map((r) => [r.key, r]))
  const cases: {
    kind: NowKind
    restaurant: string
    timeline: PopulationTimeline
    outcome?: "restaurant_rejected" | "customer_cancelled"
    note?: string
  }[] = [
    {
      kind: "awaiting_acceptance",
      restaurant: "scarpetta",
      timeline: { placed_at: ago(1) },
    },
    {
      kind: "awaiting_acceptance",
      restaurant: "mezze-vesterbro",
      timeline: { placed_at: ago(2) },
    },
    {
      kind: "preparing",
      restaurant: "scarpetta",
      timeline: {
        placed_at: ago(19),
        accepted_at: ago(17),
        claimed_at: ago(15),
        preparation_started_at: ago(14),
      },
    },
    {
      kind: "preparing",
      restaurant: "bistro-classen",
      timeline: {
        placed_at: ago(9),
        accepted_at: ago(8),
        claimed_at: ago(6),
        preparation_started_at: ago(5),
      },
    },
    {
      kind: "ready_unassigned_waiting",
      restaurant: "scarpetta",
      timeline: {
        placed_at: ago(17),
        accepted_at: ago(15),
        preparation_started_at: ago(13),
        ready_at: ago(2),
      },
    },
    {
      kind: "assigned_not_picked_up",
      restaurant: "mezze-vesterbro",
      timeline: {
        placed_at: ago(58),
        accepted_at: ago(56),
        claimed_at: ago(54),
        preparation_started_at: ago(52),
        ready_at: ago(34),
      },
    },
    {
      kind: "picked_up",
      restaurant: "scarpetta",
      timeline: {
        placed_at: ago(36),
        accepted_at: ago(34),
        claimed_at: ago(33),
        preparation_started_at: ago(31),
        ready_at: ago(12),
        picked_up_at: ago(8),
      },
    },
    {
      kind: "in_transit_stalled",
      restaurant: "bistro-classen",
      timeline: {
        placed_at: ago(85),
        accepted_at: ago(83),
        claimed_at: ago(82),
        preparation_started_at: ago(80),
        ready_at: ago(58),
        picked_up_at: ago(52),
      },
    },
    {
      kind: "reported_problem",
      restaurant: "frederiksberg-pizza",
      timeline: {
        placed_at: ago(48),
        accepted_at: ago(46),
        claimed_at: ago(45),
        preparation_started_at: ago(43),
        ready_at: ago(25),
        picked_up_at: ago(20),
      },
    },
    {
      kind: "failed_refund",
      restaurant: "golden-lotus",
      outcome: "restaurant_rejected",
      note: REJECTION_NOTES[1],
      timeline: { placed_at: ago(190), cancelled_at: ago(187) },
    },
    {
      kind: "failed_refund",
      restaurant: "mezze-vesterbro",
      outcome: "restaurant_rejected",
      note: REJECTION_NOTES[2],
      timeline: { placed_at: ago(26 * 60), cancelled_at: ago(26 * 60 - 3) },
    },
    {
      kind: "pending_refund",
      restaurant: "scarpetta",
      outcome: "customer_cancelled",
      timeline: { placed_at: ago(3), cancelled_at: ago(2) },
    },
  ]
  return cases.map((planned, index) => ({
    slot: `${NOW_SLOT_PREFIX}${stamp}:${String(index + 1).padStart(2, "0")}:${planned.kind}`,
    kind: planned.kind,
    restaurant: planned.restaurant,
    customer: pick(customersOf.get(planned.restaurant)!).key,
    agent: Math.floor(random() * agents.length),
    basket: basketOf(byKey.get(planned.restaurant)!, random),
    timeline: planned.timeline,
    ...(planned.outcome ? { outcome: planned.outcome } : {}),
    ...(planned.note ? { note: planned.note } : {}),
  }))
}

/**
 * Maps a recorded time onto the planned history from the recorded milestone
 * nearest to it: a milestone lands exactly on its planned time and any other
 * time keeps its distance from the nearest one. Unlike `retimerAlong` it does
 * not need the recorded milestones in order, which a host clock that steps
 * back a little during a long run (as WSL's does) can break.
 */
export function retimerNearest(anchors: { recorded: Date; planned: Date }[]) {
  const points = anchors.map(({ recorded, planned }) => [
    recorded.getTime(),
    planned.getTime(),
  ])
  return (time: Date) => {
    const at = time.getTime()
    let [recorded, planned] = points[0]
    for (const point of points)
      if (Math.abs(point[0] - at) < Math.abs(recorded - at))
        [recorded, planned] = point
    return new Date(planned + (at - recorded))
  }
}
