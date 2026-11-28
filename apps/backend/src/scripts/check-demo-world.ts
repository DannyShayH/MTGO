/**
 * Verifies a finished demo world run (#258). Run from apps/backend with the
 * same DEMO_WORLD_EMAIL_DOMAIN (and DEMO_WORLD_SCALE, if set) as the seed:
 *
 *   DEMO_WORLD_EMAIL_DOMAIN=<team domain> npx medusa exec ./src/scripts/check-demo-world.ts
 *
 * It plans the world again and checks the database against it: every
 * Restaurant is active with its staff and planned dishes; every planned login
 * exists; every seeded history Order sits on its planned times and finance
 * moment; none is missing except those planned after the newest one seeded;
 * every planned rating up to then was given; and every ended month is closed
 * for every seeded Restaurant, with its service fee accrued and nothing
 * pending when it closed, the month before the window included. Delivered history Orders are carried by their planned
 * agent. It prints what it found and fails on the first kind of mismatch. Neither passwords nor Customer emails are printed.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  asciiOf,
  planDemoWorld,
  type DemoWorldPlan,
} from "../lib/demo-world/plan"
import { DEMO_WORLD_RESTAURANTS } from "../lib/demo-world/restaurants"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { FEEDBACK_MODULE } from "../modules/feedback"
import type FeedbackModuleService from "../modules/feedback/service"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import type RestaurantModuleService from "../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../modules/restaurant-finance/service"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import { statementMonths } from "../workflows/restaurant-finance/statement-rules"
import { copenhagenMonthPeriod } from "../workflows/shared/copenhagen-time"
import { finishedOrders, OPERATOR, placedOrders } from "./seed-demo-world"

type Check = {
  container: MedusaContainer
  plan: DemoWorldPlan
  domain: string
  now: Date
  fail: (message: string) => void
}

/** Every Restaurant active, with its staff member and planned dishes. */
async function checkRestaurants({ container, plan, fail }: Check) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const ids = new Map<string, string>()
  for (const planned of DEMO_WORLD_RESTAURANTS) {
    const [byId] = planned.existing_id
      ? await service.listRestaurants({ id: planned.existing_id })
      : []
    const found =
      byId ?? (await service.listRestaurants({ name: planned.name }))[0]
    if (!found) {
      fail(`${planned.name} is missing`)
      continue
    }
    ids.set(planned.key, found.id)
    if (!found.is_active) fail(`${planned.name} is not active`)
    const staff = plan.staff.find((s) => s.restaurant === planned.key)!
    const [member] = await service.listRestaurantStaffs({
      restaurant_id: found.id,
      email: staff.email,
      status: "authorized",
    })
    if (!member) fail(`${planned.name} has no authorized ${staff.name}`)
    const sold = new Set(
      ((await readRestaurantWithMenu(container, found.id))?.menu ?? []).flatMap(
        ({ dishes }) => dishes.map(({ name }) => name.da),
      ),
    )
    const absent = planned.menu
      .flatMap(({ dishes }) => dishes)
      .filter(({ name }) => !sold.has(name.da))
    if (absent.length)
      fail(
        `${planned.name} lacks ${absent.map(({ name }) => name.da).join(", ")}`,
      )
  }
  return ids
}

/** Every planned login: operator, staff, agents and Customers. */
async function checkLogins({ container, plan, domain, fail }: Check) {
  const auth = container.resolve(Modules.AUTH)
  const operator = `${asciiOf(OPERATOR.first_name)}.${asciiOf(OPERATOR.last_name)}@${domain}`
  const logins: [string, string[]][] = [
    ["emailpass", [operator, ...plan.staff.map(({ email }) => email)]],
    ["delivery-agent-emailpass", plan.agents.map(({ email }) => email)],
    ["customer-emailpass", plan.customers.map(({ email }) => email)],
  ]
  for (const [provider, emails] of logins) {
    const found = await auth.listProviderIdentities(
      // The filter takes a list as every module filter does; its type says one.
      { provider, entity_id: emails as unknown as string },
      { take: null, select: ["entity_id"] },
    )
    if (found.length !== emails.length)
      fail(`${emails.length - found.length} ${provider} logins are missing`)
  }
}

/**
 * History Orders on their planned times, none missing before the newest one
 * seeded, and every rating planned up to then given.
 */
async function checkHistory(check: Check, restaurant_ids: string[]) {
  const { container, plan, fail } = check
  const placed = await placedOrders(container, restaurant_ids)
  const { finished, unfinished } = await finishedOrders(container, plan, placed)
  if (unfinished.length)
    fail(`${unfinished.length} seeded Orders are off their planned history`)
  const seeded = plan.orders.filter(({ slot }) => finished.has(slot))
  const newest = Math.max(
    ...seeded.map(({ timeline }) => timeline.placed_at.getTime()),
  )
  const missing = plan.orders.filter(
    ({ slot, timeline }) =>
      !finished.has(slot) && timeline.placed_at.getTime() <= newest,
  )
  if (missing.length) fail(`${missing.length} planned Orders were never seeded`)

  const orderOf = new Map(placed.map(({ slot, order_id }) => [slot, order_id]))
  const feedback = container.resolve<FeedbackModuleService>(FEEDBACK_MODULE)
  const ids = seeded.map(({ slot }) => orderOf.get(slot)!)
  const rated = new Set<string>()
  for (let start = 0; start < ids.length; start += 1000)
    for (const { order_id } of await feedback.listFeedbacks(
      { order_id: ids.slice(start, start + 1000) },
      { select: ["order_id"], take: null },
    ))
      rated.add(order_id)
  const unrated = seeded.filter(
    ({ slot, rating }) =>
      rating &&
      rating.rated_at.getTime() <= newest &&
      !rated.has(orderOf.get(slot)!),
  )
  if (unrated.length) fail(`${unrated.length} planned ratings are missing`)
  const offAgent = await deliveredByOtherAgents(check, seeded, orderOf)
  if (offAgent)
    fail(
      `${offAgent} delivered history Orders are not carried by their planned agent`,
    )
  return {
    seeded,
    rated: rated.size,
    later: plan.orders.length - seeded.length - missing.length,
  }
}

/** Delivered history Orders whose delivery another agent carried. */
async function deliveredByOtherAgents(
  { container, plan }: Check,
  seeded: DemoWorldPlan["orders"],
  orderOf: Map<string, string>,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const agents = await delivery.listDeliveryAgents(
    { email: plan.agents.map(({ email }) => email) },
    { select: ["id", "email"], take: null },
  )
  const idOf = new Map(agents.map(({ id, email }) => [email, id]))
  const delivered = seeded.filter(({ outcome }) => outcome === "delivered")
  const plannedOf = new Map(
    delivered.map((order) => [
      orderOf.get(order.slot)!,
      idOf.get(plan.agents[order.agent].email),
    ]),
  )
  const ids = [...plannedOf.keys()]
  let off = 0
  for (let start = 0; start < ids.length; start += 1000)
    for (const {
      order_id,
      assigned_agent_id,
    } of await delivery.listIntendedDeliveries(
      { order_id: ids.slice(start, start + 1000) },
      { select: ["order_id", "assigned_agent_id"], take: null },
    ))
      if (assigned_agent_id !== (plannedOf.get(order_id) ?? null)) off++
  return off
}

/**
 * Every ended month closed for every seeded Restaurant, and its service fee
 * accrued, from the Restaurant's creation month on.
 */
async function checkMonths(
  { container, plan, now, fail }: Check,
  restaurant_ids: string[],
) {
  const created_at = plan.restaurants[0].created_at
  const ended = statementMonths(created_at, now)
    .reverse()
    .filter((month) => copenhagenMonthPeriod(month).ends_at <= now)
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const filter = { restaurant_id: restaurant_ids, month: ended }
  const select = ["restaurant_id", "month"]
  const closures = await finance.listFinanceClosures(filter, {
    select: [...select, "summary"],
    take: null,
  })
  const fees = await finance.listFinanceServiceFees(filter, {
    select,
    take: null,
  })
  const expected = restaurant_ids.length * ended.length
  if (closures.length !== expected)
    fail(
      `${expected - closures.length} of ${expected} ended statement months are not closed`,
    )
  if (fees.length !== expected)
    fail(
      `${expected - fees.length} of ${expected} ended statement months have no accrued service fee`,
    )
  // A closed month keeps what was pending when it closed, so a seed that
  // closes a month before all its processing is in place shows it forever.
  const pending = closures.filter(
    ({ summary }) =>
      (summary as { completeness?: string } | null)?.completeness ===
      "processing_pending",
  )
  if (pending.length)
    fail(
      `${pending.length} of ${expected} ended statement months closed while processing was pending`,
    )
  return { ended, closed: closures.length, expected }
}

export default async function checkDemoWorld({ container }: ExecArgs) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  if (
    !syntheticSeedAllowed(
      config.projectConfig.databaseUrl || "",
      process.env.NODE_ENV,
    )
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "synthetic_seed_database_required",
    )
  const domain = process.env.DEMO_WORLD_EMAIL_DOMAIN?.trim().toLowerCase()
  if (!domain)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Set DEMO_WORLD_EMAIL_DOMAIN as for the seed",
    )
  const now = new Date()
  const failures: string[] = []
  const check: Check = {
    container,
    domain,
    now,
    plan: planDemoWorld({
      now,
      email_domain: domain,
      scale: Number(process.env.DEMO_WORLD_SCALE ?? "1"),
    }),
    fail: (message) => failures.push(message),
  }
  const ids = [...(await checkRestaurants(check)).values()]
  await checkLogins(check)
  const history = await checkHistory(check, ids)
  const months = await checkMonths(check, ids)
  const { seeded } = history
  const unfulfilled = seeded.filter(({ outcome }) => outcome !== "delivered")
  const share = (unfulfilled.length / Math.max(seeded.length, 1)) * 100
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      [
        `Demo world check: ${ids.length} of ${DEMO_WORLD_RESTAURANTS.length} Restaurants, ${check.plan.customers.length} Customers, ${check.plan.agents.length} agents.`,
        `  ${seeded.length} history Orders on plan (${share.toFixed(1)}% unfulfilled), ${history.rated} rated; ${history.later} planned since the last run.`,
        `  Closed months: ${months.closed} of ${months.expected} (${months.ended.join(", ") || "none ended"}).`,
        failures.length
          ? `FAILED:\n  ${failures.join("\n  ")}`
          : "OK: the database matches the plan.",
      ].join("\n"),
    )
  if (failures.length)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "demo_world_check_failed",
    )
}
