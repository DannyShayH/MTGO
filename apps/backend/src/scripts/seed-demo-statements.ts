/**
 * Demo activity for Restaurant statements (#228): delivered Orders spread
 * over the current Copenhagen month, so the partner Statements page shows
 * realistic food credits, commission across the bands, the service fee from
 * the Restaurant's recorded active dates and the monthly balance. Run from
 * apps/backend against a local, disposable or staging database:
 *
 *   npx medusa exec ./src/scripts/seed-demo-statements.ts
 *
 * It seeds "Pizzeria Nørrebro" (or DEMO_STATEMENTS_RESTAURANT_ID), whose
 * staff sign in to see it, plus three other active, open Restaurants with a
 * menu, so other Restaurants' activity exists beside it (isolation, Admin,
 * agents). A contributor without authorized staff gets a demo staff member
 * without a password. Every Order belongs to the synthetic Customer below,
 * is placed through the real cart, mock payment and completion workflows and
 * is accepted, prepared, claimed, picked up and handed over through the real
 * workflows; finance recognizes it as in production.
 *
 * Orders fall only on dates each Restaurant was active according to its
 * recorded activation history, at lunch and dinner, never in the future. A
 * Restaurant whose history cannot establish its active dates is skipped: its
 * statement rightly withholds the fee. Each Order's recorded times are then
 * moved back to its planned handover and finance recognizes it again from
 * there, so its entry shows that date. Reruns are safe: each Order has a
 * date slot in its metadata; a later run adds only missing slots, such as
 * the days since the last run, and a run in a new month leaves the previous
 * month as a closed statement. MTOGO_FF_RESTAURANT_STATEMENTS=true shows the
 * page.
 *
 * DEMO_STATEMENTS_REMOVE_BLOCKERS=true first removes the demo Restaurant's
 * earlier test Orders that keep its current month incomplete: Orders with a
 * recorded evidence problem, such as delivered Orders without a preserved
 * purchase basis. They are soft-deleted
 * with their operational and finance records, so the Restaurant's Orders
 * and statement no longer show them. Synthetic test data only.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import {
  placeDemoPaidOrder,
  type DemoBasketLine,
  type DemoDish,
} from "../lib/demo-paid-order"
import {
  planDemoStatementOrders,
  type DemoStatementBasket,
  type PlannedStatementOrder,
} from "../lib/demo-statements-plan"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import type RestaurantModuleService from "../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../modules/restaurant-finance/service"
import { claimDeliveryWorkflow } from "../workflows/delivery/assignment"
import { confirmPickupWorkflow } from "../workflows/delivery/pickup"
import { confirmHandoverWorkflow } from "../workflows/delivery/terminal"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import {
  acceptPartnerOrderWorkflow,
  markPartnerOrderReadyWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../workflows/order-operations"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../workflows/restaurant-finance/calculation"
import { recognizeDeliveredOrder } from "../workflows/restaurant-finance/recognition"
import { serviceFeeEvidence } from "../workflows/restaurant-finance/service-fee"
import { readParticipation } from "../workflows/restaurant-finance/participation"
import { accrueServiceFee } from "../workflows/restaurant-finance/service-fee-accrual"
import { createAuthorizedStaffWorkflow } from "../workflows/restaurant-staff"
import { backdate } from "./seed-demo-feedback"

const SLOT_KEY = "demo_statements_228"
const PRIMARY_NAME = "Pizzeria Nørrebro"
const CONTRIBUTORS = 3
const CUSTOMER = {
  email: "freja.holm.demo@example.test",
  first_name: "Freja",
  last_name: "Holm",
  phone: "+4531827364",
}
const AGENT = {
  name: "Mikkel Jensen",
  email: "statements-demo-agent@example.test",
}

type StatementRestaurant = {
  id: string
  name: string
  staff_id: string
  dishes: DemoDish[]
  /** Where the Orders go: the first postal code it delivers to. */
  postal_code: string
  pickup_postal_code: string
  planned: PlannedStatementOrder[]
}

const refuse = (type: string, message: string) => new MedusaError(type, message)

/**
 * The demo staff member of a contributor that has none. It gets a login
 * password only when DEMO_STATEMENTS_STAFF_PASSWORD is set, so its
 * statement can be opened in the partner app too.
 */
async function demoStaff(container: MedusaContainer, restaurant_id: string) {
  const restaurants =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const [staff] = await restaurants.listRestaurantStaffs(
    { restaurant_id, status: "authorized" },
    { take: 1, select: ["id"] },
  )
  const email = demoStaffEmail(restaurant_id)
  if (staff) {
    await setDemoStaffPassword(container, email)
    return staff.id
  }
  const [identity] = await container
    .resolve(Modules.AUTH)
    .createAuthIdentities([
      { provider_identities: [{ provider: "emailpass", entity_id: email }] },
    ])
  const { result } = await createAuthorizedStaffWorkflow(container).run({
    input: {
      restaurant_id,
      name: "Statements Demo Staff",
      email,
      auth_identity_id: identity.id,
    },
  })
  await setDemoStaffPassword(container, email)
  return result.id
}

const demoStaffEmail = (restaurant_id: string) =>
  `statements-demo-staff-${restaurant_id.toLowerCase()}@example.test`

/** Gives this seed's own demo staff login the optional demo password. */
async function setDemoStaffPassword(container: MedusaContainer, email: string) {
  const password = process.env.DEMO_STATEMENTS_STAFF_PASSWORD
  if (!password) return
  const auth = container.resolve(Modules.AUTH)
  const [identity] = await auth.listProviderIdentities(
    { provider: "emailpass", entity_id: email },
    { take: 1, select: ["id"] },
  )
  // Staff the Restaurant already had keep their own login.
  if (!identity) return
  const { success, error } = await auth.updateProvider("emailpass", {
    entity_id: email,
    password,
  })
  if (!success)
    throw refuse(
      MedusaError.Types.UNEXPECTED_STATE,
      `demo_staff_password_not_set: ${error ?? "unknown reason"}`,
    )
}

/**
 * A Restaurant that can take demo Orders: active, open, with an orderable
 * dish and a delivery area, and its planned Orders on its recorded active
 * dates this month. `null` when it cannot, with the reason logged.
 */
async function prepareRestaurant(
  container: MedusaContainer,
  restaurant_id: string,
  per_day: { min: number; max: number },
  now: Date,
): Promise<StatementRestaurant | null> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const found = await readRestaurantWithMenu(container, restaurant_id)
  const dishes = (found?.menu ?? [])
    .flatMap((category) => category.dishes)
    .filter(({ is_sold_out }) => !is_sold_out) as unknown as DemoDish[]
  const postal_code =
    found?.restaurant.delivery_area_postal_codes?.[0]?.postal_code
  if (!found?.restaurant.is_active || !found.restaurant.is_open) return null
  if (!dishes.length || !postal_code) return null
  const name = found.restaurant.name
  const [pickup] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      { id: restaurant_id },
      { take: 1, select: ["address_postal_code"] },
    )
  const facts = (await readParticipation(container, [restaurant_id])).get(
    restaurant_id,
  )!
  const month = copenhagenMonthOf(now)
  const evidence = serviceFeeEvidence(facts, month, now)
  if (evidence.status === "evidence_missing") {
    logger.warn(
      `Statements demo: skipping ${name}; its activation history does not show its active dates, so its statement withholds the fee`,
    )
    return null
  }
  const activations = facts.changes
    .filter(({ kind }) => kind === "activated")
    .map(({ occurred_at }) => new Date(occurred_at).getTime())
  const not_before = new Date(
    Math.max(
      copenhagenMonthPeriod(month).starts_at.getTime(),
      Math.min(...activations),
    ),
  )
  return {
    id: restaurant_id,
    name,
    staff_id: await demoStaff(container, restaurant_id),
    dishes,
    postal_code,
    pickup_postal_code: pickup.address_postal_code,
    planned: planDemoStatementOrders({
      seed: restaurant_id,
      active_dates: evidence.active_dates,
      not_before,
      now,
      per_day,
    }),
  }
}

/** The primary Restaurant and up to three contributors, by name. */
async function demoRestaurants(container: MedusaContainer, now: Date) {
  const restaurants =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const wanted = process.env.DEMO_STATEMENTS_RESTAURANT_ID
  const [primaryRecord] = await restaurants.listRestaurants(
    wanted ? { id: wanted } : { name: PRIMARY_NAME },
    { take: 1, select: ["id"] },
  )
  if (!primaryRecord)
    throw refuse(
      MedusaError.Types.NOT_FOUND,
      wanted
        ? `No Restaurant ${wanted}`
        : `No ${PRIMARY_NAME}; run seed-demo-restaurant.ts and activate it in Admin first`,
    )
  const primary = await prepareRestaurant(
    container,
    primaryRecord.id,
    { min: 2, max: 4 },
    now,
  )
  if (!primary)
    throw refuse(
      MedusaError.Types.NOT_ALLOWED,
      "The demo Restaurant must be active and open, with a published dish, a delivery area and recorded activation",
    )
  const others = await restaurants.listRestaurants(
    { is_active: true, is_open: true },
    { select: ["id"], order: { name: "ASC" }, take: null },
  )
  const contributors: StatementRestaurant[] = []
  for (const { id } of others) {
    if (contributors.length === CONTRIBUTORS) break
    if (id === primary.id) continue
    const prepared = await prepareRestaurant(
      container,
      id,
      { min: 0, max: 2 },
      now,
    )
    if (prepared) contributors.push(prepared)
  }
  return [primary, ...contributors]
}

/** The synthetic Customer every demo Order belongs to, created once. */
async function demoCustomer(container: MedusaContainer) {
  const [existing] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email: CUSTOMER.email, has_account: true })
  if (existing) return existing
  const {
    result: [created],
  } = await createCustomersWorkflow(container).run({
    input: { customersData: [{ ...CUSTOMER, has_account: true }] },
  })
  return created
}

/** The demo agent, authorized for every pickup and destination postal code. */
async function demoAgent(container: MedusaContainer, postal_codes: string[]) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [existing] = await delivery.listDeliveryAgents(
    { email: AGENT.email },
    { take: 1 },
  )
  const agent =
    existing ??
    (await delivery.createDeliveryAgents({
      ...AGENT,
      status: "authorized",
      invited_by: "seed",
      accepted_at: new Date(),
    }))
  const areas = new Set(
    (
      await delivery.listDeliveryAgentAreas(
        { agent_id: agent.id },
        { select: ["postal_code"] },
      )
    ).map(({ postal_code }) => postal_code),
  )
  for (const postal_code of new Set(postal_codes))
    if (!areas.has(postal_code))
      await delivery.createDeliveryAgentAreas({
        agent_id: agent.id,
        postal_code,
      })
  return agent.id
}

/** Slots already delivered for the demo Customer, as `restaurant:slot`. */
async function deliveredSlots(container: MedusaContainer, customer_id: string) {
  const { data: orders } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { customer_id },
    })
  const seeded = (
    orders as { id: string; metadata?: Record<string, unknown> | null }[]
  ).filter(({ metadata }) => typeof metadata?.[SLOT_KEY] === "string")
  if (!seeded.length) return new Set<string>()
  const delivered = new Set(
    (
      await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .listIntendedDeliveries(
          {
            order_id: seeded.map(({ id }) => id),
            terminal_outcome: "delivered",
          },
          { select: ["order_id"], take: null },
        )
    ).map(({ order_id }) => order_id),
  )
  return new Set(
    seeded
      .filter(({ id }) => delivered.has(id))
      .map(({ metadata }) => metadata![SLOT_KEY] as string),
  )
}

/** The basket for a planned size, rotating through the menu. */
function basketOf(
  dishes: DemoDish[],
  size: DemoStatementBasket,
  offset: number,
): DemoBasketLine[] {
  const dish = (index: number) => dishes[(offset + index) % dishes.length]
  const lines: Record<DemoStatementBasket, [number, number][]> = {
    single: [[0, 1]],
    pair: [[0, 2]],
    dinner: [
      [0, 1],
      [1, 1],
      [2, 2],
    ],
    family: [
      [0, 2],
      [1, 2],
      [2, 1],
      [3, 2],
    ],
    catering: [
      [0, 8],
      [1, 6],
      [2, 6],
    ],
  }
  // Repeated dishes on a small menu merge into one line.
  const merged = new Map<DemoDish, number>()
  for (const [index, quantity] of lines[size])
    merged.set(dish(index), (merged.get(dish(index)) ?? 0) + quantity)
  return [...merged].map(([line, quantity]) => ({ dish: line, quantity }))
}

/**
 * Finance recognized the handover at the moment the seed confirmed it; after
 * the recorded times moved back, it recognizes it again from the planned
 * handover. Application code never removes a booked entry (spec #52 §3);
 * this synthetic seed does, only on databases `syntheticSeedAllowed`
 * accepts, and only for the Order it has just created. The posting time is
 * set just after the handover, as a prompt recognition would have posted it,
 * in the same month.
 */
async function recognizeAtPlannedHandover(
  container: MedusaContainer,
  order_id: string,
  handover_at: Date,
) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const source = {
    source_kind: "order_delivered" as const,
    source_id: order_id,
  }
  const receipts = await finance.listFinanceReceipts(source, { select: ["id"] })
  const entries = receipts.length
    ? await finance.listFinanceJournalEntries(
        { receipt_id: receipts.map(({ id }) => id) },
        { select: ["id"] },
      )
    : []
  await finance.deleteFinanceJournalEntries(entries.map(({ id }) => id))
  await finance.deleteFinanceReceipts(receipts.map(({ id }) => id))
  const outcome = await recognizeDeliveredOrder(container, order_id)
  if (outcome !== "recognized")
    throw refuse(
      MedusaError.Types.UNEXPECTED_STATE,
      `Order ${order_id} was not recognized again: ${outcome}`,
    )
  const posted_at = new Date(handover_at.getTime() + 3000)
  const [receipt] = await finance.listFinanceReceipts(source, {
    select: ["id"],
  })
  await finance.updateFinanceReceipts({ id: receipt.id, posted_at })
  const [entry] = await finance.listFinanceJournalEntries(
    { receipt_id: receipt.id },
    { select: ["id"] },
  )
  await finance.updateFinanceJournalEntries({ id: entry.id, posted_at })
}

/**
 * Soft-deletes the Restaurant's test Orders that keep `month` incomplete
 * (DEMO_STATEMENTS_REMOVE_BLOCKERS): Orders with a recorded evidence
 * problem, such as delivered Orders missing their purchase basis. Since #229
 * finance recognizes prepared-food compensation, so it is no blocker. Their
 * operational, delivery and
 * finance records go with them. Application code never deletes Orders or
 * financial evidence; this synthetic seed does, only on databases
 * `syntheticSeedAllowed` accepts and only when asked to.
 */
async function removeStatementBlockers(
  container: MedusaContainer,
  restaurant_id: string,
  month: string,
) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const problems = await finance.listFinanceProblems(
    { restaurant_id, original_month: month },
    { select: ["id", "order_id"], take: null },
  )
  const order_ids = [
    ...new Set(problems.flatMap(({ order_id }) => order_id ?? [])),
  ]
  if (!order_ids.length) return []
  const { data: orders } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: order_ids },
    })
  const byOrder = { order_id: order_ids }
  const ids = async <T extends { id: string }>(records: Promise<T[]>) =>
    (await records).map(({ id }) => id)
  await finance.softDeleteFinanceProblems(problems.map(({ id }) => id))
  await operations.softDeleteFoodCredits(
    await ids(operations.listFoodCredits(byOrder, { select: ["id"] })),
  )
  await operations.softDeleteRefundAttempts(
    await ids(operations.listRefundAttempts(byOrder, { select: ["id"] })),
  )
  await operations.softDeleteRefundObligations(
    await ids(operations.listRefundObligations(byOrder, { select: ["id"] })),
  )
  await operations.softDeleteOrderOperations(
    await ids(operations.listOrderOperations(byOrder, { select: ["id"] })),
  )
  await delivery.softDeleteDeliveryAttentions(
    await ids(delivery.listDeliveryAttentions(byOrder, { select: ["id"] })),
  )
  await delivery.softDeleteIntendedDeliveries(
    await ids(delivery.listIntendedDeliveries(byOrder, { select: ["id"] })),
  )
  await container.resolve(Modules.ORDER).softDeleteOrders(order_ids)
  return (orders as unknown as { display_id: number }[]).map(
    ({ display_id }) => `#${display_id}`,
  )
}

/** One planned Order, from checkout to recognized handover, moved back. */
async function seedOrder(
  container: MedusaContainer,
  input: {
    region_id: string
    customer: { id: string; email: string }
    restaurant: StatementRestaurant
    agent_id: string
    planned: PlannedStatementOrder
    position: number
  },
) {
  const { restaurant, planned } = input
  const basket = basketOf(restaurant.dishes, planned.basket, input.position)
  const order = await placeDemoPaidOrder(container, {
    region_id: input.region_id,
    customer: input.customer,
    dish: basket[0].dish,
    basket,
    postal_code: restaurant.postal_code,
    metadata: { [SLOT_KEY]: `${restaurant.id}:${planned.slot}` },
  })
  const staffRun = {
    input: { staff_id: restaurant.staff_id, order_id: order.id },
  }
  const agentRun = (step: string) => ({
    input: {
      order_id: order.id,
      agent_id: input.agent_id,
      request_id: `${SLOT_KEY}-${order.id}-${step}`,
    },
  })
  await acceptPartnerOrderWorkflow(container).run(staffRun)
  await claimDeliveryWorkflow(container).run(agentRun("claim"))
  await startPartnerOrderPreparationWorkflow(container).run(staffRun)
  await markPartnerOrderReadyWorkflow(container).run(staffRun)
  await confirmPickupWorkflow(container).run(agentRun("pickup"))
  await confirmHandoverWorkflow(container).run(agentRun("handover"))
  await backdate(container, order.id, planned.handover_at)
  await recognizeAtPlannedHandover(container, order.id, planned.handover_at)
}

export default async function seedDemoStatements({ container }: ExecArgs) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  if (
    !syntheticSeedAllowed(
      config.projectConfig.databaseUrl || "",
      process.env.NODE_ENV,
    )
  )
    throw refuse(
      MedusaError.Types.NOT_ALLOWED,
      "synthetic_seed_database_required",
    )
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  if (!region)
    throw refuse(
      MedusaError.Types.NOT_FOUND,
      "No DKK region; run the backend migrations first",
    )
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = new Date()
  const restaurants = await demoRestaurants(container, now)
  if (process.env.DEMO_STATEMENTS_REMOVE_BLOCKERS === "true") {
    const removed = await removeStatementBlockers(
      container,
      restaurants[0].id,
      copenhagenMonthOf(now),
    )
    const numbers = removed.length ? ": " + removed.join(", ") : ""
    logger.info(
      `Statements demo: removed ${removed.length} test Orders that kept ${restaurants[0].name}'s month incomplete${numbers}`,
    )
  }
  const customer = await demoCustomer(container)
  const agent_id = await demoAgent(
    container,
    restaurants.flatMap(({ postal_code, pickup_postal_code }) => [
      postal_code,
      pickup_postal_code,
    ]),
  )
  const done = await deliveredSlots(container, customer.id)

  const summary: string[] = []
  for (const restaurant of restaurants) {
    const missing = restaurant.planned.filter(
      ({ slot }) => !done.has(`${restaurant.id}:${slot}`),
    )
    logger.info(
      `Statements demo: ${restaurant.name}, ${restaurant.planned.length - missing.length} Orders already seeded, creating ${missing.length}`,
    )
    for (const [position, planned] of missing.entries())
      await seedOrder(container, {
        region_id: region.id,
        customer,
        restaurant,
        agent_id,
        planned,
        position,
      })
    const fee = await accrueServiceFee(container, restaurant.id)
    const signIn =
      restaurant !== restaurants[0] &&
      process.env.DEMO_STATEMENTS_STAFF_PASSWORD
        ? `; staff sign-in ${demoStaffEmail(restaurant.id)}`
        : ""
    summary.push(
      `  ${restaurant.name}: ${restaurant.planned.length} delivered demo Orders this month, service fee ${fee}${signIn}`,
    )
  }
  logger.info(
    [
      `Statements demo for ${copenhagenMonthOf(now)}:`,
      ...summary,
      `Sign in to the partner app as staff of ${restaurants[0].name}, with the backend started with MTOGO_FF_RESTAURANT_STATEMENTS=true, and open Statements.`,
    ].join("\n"),
  )
}
