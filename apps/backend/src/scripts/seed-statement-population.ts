/**
 * The statement verification population (#235; spec #52 decision 13): 100
 * synthetic Customers and 500 Orders at four Restaurants over three
 * Copenhagen months, for reconciling statements against the independently
 * expected manifest and for measuring statement reads. Run from apps/backend
 * against a local, disposable or staging database, with the backend stopped
 * so its recovery job cannot close a month half-way through:
 *
 *   npx medusa exec ./src/scripts/seed-statement-population.ts
 *
 * It creates or reuses the plan's four Restaurants (bilingual menus, every
 * population postal code as delivery area, common terms, one authorized
 * staff member each), five Delivery agents, one operator and the 100
 * Customers. Every Order is placed through the real cart, mock payment and
 * completion workflows and ends through the real workflows: handover,
 * Customer cancellation, staff rejection, acceptance timeout and unassigned
 * timeout through the recovery sweep's own expiry for that Order only, or
 * Operator cancellation after preparation started. Its recorded times are
 * then moved onto its planned history and finance recognizes it again from
 * there (`retimeOrder`, `recognizeAtPlannedTime`), except six deliveries from
 * the month before the anchor month that post in the anchor month as linked
 * late adjustments.
 *
 * When all 500 exist, it moves each Restaurant's creation, agreement and
 * participation history to the plan (one joined on the tenth of the first
 * month, one paused for five days in the second), records the ended months'
 * fees as accrued at their end, closes those months and accrues the current
 * fee. Reruns are safe: each Order carries `<anchor date>:<slot>` in its
 * metadata and an Order whose finance receipt already sits at its planned
 * time is kept, so a rerun creates only missing Orders and an unfinished
 * one from an interrupted run is discarded with its records first. Nothing
 * outside the population is changed, except that the recovery sweep also
 * expires other Orders that are already past their deadline.
 *
 * DEMO_STATEMENT_POPULATION_STAFF_PASSWORD gives each population staff
 * login that password, so the partner app can show its statements.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { placeDemoPaidOrder, type DemoDish } from "../lib/demo-paid-order"
import {
  planStatementPopulation,
  POPULATION_AREAS,
  POPULATION_KEY,
  POPULATION_OPERATOR,
  populationStaffEmail,
  POPULATION_RESTAURANTS,
  qualifyingMoment,
  retimerAlong,
  type PopulationCustomer,
  type PopulationOrder,
  type PopulationRestaurant,
  type StatementPopulation,
} from "../lib/statement-population-plan"
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
import { publishSyntheticMenuWorkflow } from "../workflows/menu"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import {
  acceptPartnerOrderWorkflow,
  cancelAcceptedOrderWorkflow,
  cancelCustomerOrderWorkflow,
  markPartnerOrderReadyWorkflow,
  rejectPartnerOrderWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../workflows/order-operations"
import { settleCancellation } from "../workflows/order-operations/cancellation"
import { SYSTEM_ACTOR } from "../workflows/order-operations/rules"
import { expireDueOrder } from "../workflows/order-operations/steps/recover-order-operations"
import { expireUnassignedDelivery } from "../workflows/order-operations/unassigned-cancellation"
import {
  copenhagenDateOf,
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../workflows/restaurant-finance/calculation"
import { recognizeCancelledOrder } from "../workflows/restaurant-finance/cancellation-recognition"
import {
  closeRestaurantStatements,
  reconcileClosedServiceFees,
} from "../workflows/restaurant-finance/closure"
import { readParticipation } from "../workflows/restaurant-finance/participation"
import { recognizeDeliveredOrder } from "../workflows/restaurant-finance/recognition"
import { serviceFeeEvidence } from "../workflows/restaurant-finance/service-fee"
import { accrueServiceFee } from "../workflows/restaurant-finance/service-fee-accrual"
import {
  createAuthorizedStaffWorkflow,
  openRestaurantWorkflow,
} from "../workflows/restaurant-staff"
import {
  activateRestaurantWorkflow,
  changeDeliveryAreaWorkflow,
  createRestaurantWorkflow,
  recordCommercialTermsWorkflow,
} from "../workflows/restaurants"
import { COMMON_MVP_TERMS_V1 } from "../workflows/restaurants/commercial-terms"

type SeededRestaurant = {
  id: string
  plan: PopulationRestaurant
  staff_id: string
  /** Orderable dishes by plan handle. */
  dishes: Map<string, DemoDish>
}
type Context = {
  container: MedusaContainer
  region_id: string
  operator_id: string
  restaurants: Map<string, SeededRestaurant>
  customers: Map<string, PopulationCustomer & { id: string }>
  agents: string[]
}

const refuse = (type: string, message: string) => new MedusaError(type, message)
/** The staff login's optional demo password. */
async function setStaffPassword(container: MedusaContainer, email: string) {
  const password = process.env.DEMO_STATEMENT_POPULATION_STAFF_PASSWORD
  if (!password) return
  const { success, error } = await container
    .resolve(Modules.AUTH)
    .updateProvider("emailpass", { entity_id: email, password })
  if (!success)
    throw refuse(
      MedusaError.Types.UNEXPECTED_STATE,
      `population_staff_password_not_set: ${error ?? "unknown reason"}`,
    )
}

/** The plan's Restaurant: created, set up and opened on the first run. */
async function populationRestaurant(
  container: MedusaContainer,
  plan: PopulationRestaurant,
): Promise<SeededRestaurant> {
  const restaurants =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const email = populationStaffEmail(plan)
  let [record] = await restaurants.listRestaurants(
    { name: plan.name },
    { take: 1, select: ["id", "is_open"] },
  )
  if (!record) {
    const {
      result: { restaurant },
    } = await createRestaurantWorkflow(container).run({
      input: {
        name: plan.name,
        address_street: plan.street,
        address_postal_code: plan.postal_code,
        address_city: plan.city,
        contact_phone: plan.phone,
        contact_email: `${plan.slug}@restaurant.example`,
      },
    })
    const restaurant_id = restaurant.id
    await changeDeliveryAreaWorkflow(container).run({
      input: {
        restaurant_id,
        add: POPULATION_AREAS.map(({ postal_code }) => postal_code),
        remove: [],
      },
    })
    await recordCommercialTermsWorkflow(container).run({
      input: {
        restaurant_id,
        terms_version: COMMON_MVP_TERMS_V1.terms_version,
        recorded_by: SYSTEM_ACTOR,
      },
    })
    await publishSyntheticMenuWorkflow(container).run({
      input: {
        restaurant_id,
        categories: plan.menu.map(({ name, dishes }) => ({
          name,
          dishes: dishes.map(({ handle, name, description, price }) => ({
            handle,
            name,
            ...(description ? { description } : {}),
            price,
          })),
        })),
      },
    })
    const [identity] = await container
      .resolve(Modules.AUTH)
      .createAuthIdentities([
        { provider_identities: [{ provider: "emailpass", entity_id: email }] },
      ])
    await createAuthorizedStaffWorkflow(container).run({
      input: {
        restaurant_id,
        name: `${plan.name} staff`,
        email,
        auth_identity_id: identity.id,
      },
    })
    await activateRestaurantWorkflow(container).run({
      input: { restaurant_id, operator_id: SYSTEM_ACTOR },
    })
    record = { id: restaurant_id, is_open: false } as typeof record
  }
  const [staff] = await restaurants.listRestaurantStaffs(
    { restaurant_id: record.id, status: "authorized", email },
    { take: 1, select: ["id"] },
  )
  if (!staff)
    throw refuse(
      MedusaError.Types.NOT_FOUND,
      `${plan.name} has no authorized population staff`,
    )
  await setStaffPassword(container, email)
  if (!record.is_open)
    await openRestaurantWorkflow(container).run({
      input: { restaurant_id: record.id, staff_id: staff.id },
    })
  const menu = await readRestaurantWithMenu(container, record.id)
  const byName = new Map(
    (menu?.menu ?? [])
      .flatMap(({ dishes }) => dishes)
      .map((published) => [published.name.en, published]),
  )
  const dishes = new Map<string, DemoDish>()
  for (const planned of plan.menu.flatMap(({ dishes }) => dishes)) {
    const published = byName.get(planned.name.en)
    if (!published || published.is_sold_out)
      throw refuse(
        MedusaError.Types.NOT_FOUND,
        `${plan.name} does not sell ${planned.name.en}`,
      )
    dishes.set(planned.handle, published as unknown as DemoDish)
  }
  return { id: record.id, plan, staff_id: staff.id, dishes }
}

/** The plan's Customers with their default address, created once. */
async function populationCustomers(
  container: MedusaContainer,
  planned: PopulationCustomer[],
) {
  const service = container.resolve(Modules.CUSTOMER)
  const existing = await service.listCustomers(
    { email: planned.map(({ email }) => email), has_account: true },
    { take: null, select: ["id", "email"] },
  )
  const idOf = new Map(existing.map(({ id, email }) => [email, id]))
  const missing = planned.filter(({ email }) => !idOf.has(email))
  if (missing.length) {
    const { result } = await createCustomersWorkflow(container).run({
      input: {
        customersData: missing.map((customer) => ({
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          has_account: true,
          metadata: { [POPULATION_KEY]: customer.key },
          addresses: [
            {
              first_name: customer.first_name,
              last_name: customer.last_name,
              address_1: customer.address_1,
              postal_code: customer.postal_code,
              city: customer.city,
              country_code: "dk",
              phone: customer.phone,
              is_default_shipping: true,
              is_default_billing: true,
            },
          ],
        })),
      },
    })
    for (const { id, email } of result) idOf.set(email, id)
  }
  return new Map(
    planned.map((customer) => [
      customer.key,
      { ...customer, id: idOf.get(customer.email)! },
    ]),
  )
}

/** The plan's Delivery agents, authorized for every population area. */
async function populationAgents(container: MedusaContainer, names: string[]) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const ids: string[] = []
  for (const [index, name] of names.entries()) {
    const email = `population-agent-${index + 1}@example.test`
    const [existing] = await delivery.listDeliveryAgents({ email }, { take: 1 })
    const agent =
      existing ??
      (await delivery.createDeliveryAgents({
        name,
        email,
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
    for (const { postal_code } of POPULATION_AREAS)
      if (!areas.has(postal_code))
        await delivery.createDeliveryAgentAreas({
          agent_id: agent.id,
          postal_code,
        })
    ids.push(agent.id)
  }
  return ids
}

/** The operator who cancels accepted Orders, as a Medusa Admin user. */
async function populationOperator(container: MedusaContainer) {
  const users = container.resolve(Modules.USER)
  const [existing] = await users.listUsers({ email: POPULATION_OPERATOR.email })
  return (existing ?? (await users.createUsers(POPULATION_OPERATOR))).id
}

/** Population Orders already placed, as `slot -> order id`, by Restaurant. */
async function placedOrders(
  container: MedusaContainer,
  restaurant_ids: string[],
) {
  const operations = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { restaurant_id: restaurant_ids },
      { select: ["order_id"], take: null },
    )
  if (!operations.length) return []
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: operations.map(({ order_id }) => order_id) },
    })
  return (data as { id: string; metadata?: Record<string, unknown> | null }[])
    .filter(({ metadata }) => typeof metadata?.[POPULATION_KEY] === "string")
    .map(({ id, metadata }) => {
      const [anchor_date, slot] = (metadata![POPULATION_KEY] as string).split(
        ":",
      )
      return { order_id: id, anchor_date, slot }
    })
}

/** Orders whose finance receipt already records their planned moment. */
async function finishedOrders(
  container: MedusaContainer,
  population: StatementPopulation,
  placed: { order_id: string; slot: string }[],
) {
  const receipts = placed.length
    ? await container
        .resolve<RestaurantFinanceModuleService>(RESTAURANT_FINANCE_MODULE)
        .listFinanceReceipts(
          { order_id: placed.map(({ order_id }) => order_id) },
          { select: ["order_id", "occurred_at"], take: null },
        )
    : []
  const recorded = new Map(
    receipts.map(({ order_id, occurred_at }) => [
      order_id,
      new Date(occurred_at).getTime(),
    ]),
  )
  const bySlot = new Map(population.orders.map((order) => [order.slot, order]))
  const finished = new Map<string, string>()
  const unfinished: string[] = []
  for (const { order_id, slot } of placed) {
    const planned = bySlot.get(slot)
    if (
      planned &&
      !finished.has(slot) &&
      recorded.get(order_id) === qualifyingMoment(planned).getTime()
    )
      finished.set(slot, order_id)
    else unfinished.push(order_id)
  }
  return { finished, unfinished }
}

/**
 * Soft-deletes Orders an interrupted run left unfinished, with their
 * operational, delivery and finance records, so the recovery job does not
 * later expire them into the population's statements. Application code
 * never deletes Orders or financial evidence; this synthetic seed does, only
 * on databases `syntheticSeedAllowed` accepts and only for its own Orders.
 */
async function discardOrders(container: MedusaContainer, order_ids: string[]) {
  if (!order_ids.length) return
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const byOrder = { order_id: order_ids }
  const ids = async <T extends { id: string }>(records: Promise<T[]>) =>
    (await records).map(({ id }) => id)
  const select = { select: ["id"], take: null }
  await finance.softDeleteFinanceJournalEntries(
    await ids(finance.listFinanceJournalEntries(byOrder, select)),
  )
  await finance.softDeleteFinanceReceipts(
    await ids(finance.listFinanceReceipts(byOrder, select)),
  )
  await finance.softDeleteFinanceProblems(
    await ids(finance.listFinanceProblems(byOrder, select)),
  )
  await operations.softDeleteFoodCredits(
    await ids(operations.listFoodCredits(byOrder, select)),
  )
  await operations.softDeleteRefundAttempts(
    await ids(operations.listRefundAttempts(byOrder, select)),
  )
  await operations.softDeleteRefundObligations(
    await ids(operations.listRefundObligations(byOrder, select)),
  )
  await operations.softDeleteOrderOperations(
    await ids(operations.listOrderOperations(byOrder, select)),
  )
  await delivery.softDeleteDeliveryAttentions(
    await ids(delivery.listDeliveryAttentions(byOrder, select)),
  )
  await delivery.softDeleteIntendedDeliveries(
    await ids(delivery.listIntendedDeliveries(byOrder, select)),
  )
  await container.resolve(Modules.ORDER).softDeleteOrders(order_ids)
}

/** Runs the Order through the real workflows to its planned outcome. */
async function driveOutcome(
  context: Context,
  planned: PopulationOrder,
  restaurant: SeededRestaurant,
  order_id: string,
) {
  const { container } = context
  const customer = context.customers.get(planned.customer)!
  const staffRun = { input: { staff_id: restaurant.staff_id, order_id } }
  const agentRun = (step: string) => ({
    input: {
      order_id,
      agent_id: context.agents[planned.agent],
      request_id: `${POPULATION_KEY}-${order_id}-${step}`,
    },
  })
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const { timeline } = planned
  switch (planned.outcome) {
    case "customer_cancelled":
      await cancelCustomerOrderWorkflow(container).run({
        input: { customer_id: customer.id, order_id },
      })
      return
    case "restaurant_rejected":
      await rejectPartnerOrderWorkflow(container).run({
        input: { ...staffRun.input, note: planned.note ?? null },
      })
      return
    case "acceptance_timeout": {
      // The deadline passes now instead of in five minutes; the recovery
      // sweep's own expiry and settlement then run for this Order only, so
      // other developers' overdue Orders are left alone.
      const [operation] = await operations.listOrderOperations(
        { order_id },
        { take: 1, select: ["id"] },
      )
      const now = new Date()
      await operations.updateOrderOperations({
        id: operation.id,
        acceptance_deadline: now,
      })
      if (await expireDueOrder(container, order_id, now))
        await settleCancellation(container, order_id, SYSTEM_ACTOR)
      return
    }
    default:
  }
  await acceptPartnerOrderWorkflow(container).run(staffRun)
  if (timeline.claimed_at)
    await claimDeliveryWorkflow(container).run(agentRun("claim"))
  await startPartnerOrderPreparationWorkflow(container).run(staffRun)
  if (planned.outcome === "unassigned_timeout") {
    // No agent claimed it: its claim deadline passes now, and the recovery
    // sweep's own unassigned expiry cancels this Order only, with the
    // prepared-food credit.
    const [intended] = await delivery.listIntendedDeliveries(
      { order_id },
      { take: 1, select: ["id"] },
    )
    const now = new Date()
    await delivery.updateIntendedDeliveries({
      id: intended.id,
      claim_deadline: now,
    })
    await expireUnassignedDelivery(container, order_id, now)
    return
  }
  if (timeline.ready_at)
    await markPartnerOrderReadyWorkflow(container).run(staffRun)
  if (planned.outcome === "operator_cancelled") {
    await cancelAcceptedOrderWorkflow(container).run({
      input: {
        order_id,
        operator_id: context.operator_id,
        reason: planned.note!,
      },
    })
    return
  }
  await confirmPickupWorkflow(container).run(agentRun("pickup"))
  await confirmHandoverWorkflow(container).run(agentRun("handover"))
}

type When = Date | string | null | undefined
type Stamped = Record<string, When>
/** The listed times of `record`, retimed, leaving unset times unset. */
function retimed<T extends object>(
  record: T,
  fields: string[],
  retime: (time: Date) => Date,
) {
  const update: Record<string, Date> = {}
  for (const field of fields) {
    const value = (record as Stamped)[field]
    if (value) update[field] = retime(new Date(value))
  }
  return update
}

/**
 * Moves every recorded time of the Order onto its planned history. The
 * recorded milestones anchor the mapping (`retimerAlong`); a deadline keeps
 * its distance from the milestone it was set from, unless it is the
 * timeout's own milestone. Application code never rewrites recorded
 * milestones (ADR-0021); this synthetic seed does, only on the databases
 * `syntheticSeedAllowed` accepts. The field lists name every recorded time
 * of these records: add a new one here too.
 */
async function retimeOrder(
  container: MedusaContainer,
  planned: PopulationOrder,
  order_id: string,
) {
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [operation] = await operations.listOrderOperations({ order_id })
  const [intended] = await delivery.listIntendedDeliveries({ order_id })
  const { timeline, outcome } = planned
  let deadline: When = null
  if (outcome === "acceptance_timeout") deadline = operation.acceptance_deadline
  if (outcome === "unassigned_timeout") deadline = intended?.claim_deadline
  const pairs: [When, Date | undefined][] = [
    [operation.placed_at, timeline.placed_at],
    [operation.accepted_at, timeline.accepted_at],
    [intended?.assigned_at, timeline.claimed_at],
    [operation.preparation_started_at, timeline.preparation_started_at],
    [operation.ready_at, timeline.ready_at],
    [intended?.picked_up_at, timeline.picked_up_at],
    [
      outcome.startsWith("delivered") ? intended?.terminal_at : null,
      timeline.handed_over_at,
    ],
    [deadline, timeline.deadline_at],
    [operation.cancelled_at, timeline.cancelled_at],
  ]
  const retime = retimerAlong(
    pairs.flatMap(([recorded, plannedAt]) =>
      recorded && plannedAt
        ? [{ recorded: new Date(recorded), planned: plannedAt }]
        : [],
    ),
  )
  /** A deadline set from `base` keeps its distance from it. */
  const after = (base: When, value: When) =>
    base && value
      ? new Date(
          retime(new Date(base)).getTime() +
            (new Date(value).getTime() - new Date(base).getTime()),
        )
      : undefined

  const orders = container.resolve(Modules.ORDER)
  const order = await orders.retrieveOrder(order_id, { select: ["created_at"] })
  // Coding standard 5.1 sends commerce changes through core-flows; none sets
  // `created_at`, so this synthetic seed writes the Order date directly, as
  // `backdate` in seed-demo-feedback.ts does.
  await orders.updateOrders(
    order_id,
    retimed(order, ["created_at"], retime) as Record<string, unknown>,
  )
  await operations.updateOrderOperations({
    id: operation.id,
    ...retimed(
      operation,
      [
        "placed_at",
        "accepted_at",
        "preparation_started_at",
        "ready_at",
        "cancelled_at",
        "native_cancelled_at",
        "delivery_ended_at",
        "delivery_picked_up_at",
        "delivery_assigned_at",
      ],
      retime,
    ),
    acceptance_deadline:
      outcome === "acceptance_timeout"
        ? retime(new Date(operation.acceptance_deadline!))
        : after(operation.placed_at, operation.acceptance_deadline),
  })
  if (intended)
    await delivery.updateIntendedDeliveries({
      id: intended.id,
      ...retimed(
        intended,
        [
          "accepted_at",
          "assigned_at",
          "picked_up_at",
          "native_sync_queued_at",
          "arrived_at",
          "trip_measured_at",
          "terminal_at",
          "native_delivered_at",
          "order_outcome_recorded_at",
        ],
        retime,
      ),
      claim_deadline:
        outcome === "unassigned_timeout"
          ? retime(new Date(intended.claim_deadline!))
          : after(intended.accepted_at, intended.claim_deadline),
    })
  for (const attention of await delivery.listDeliveryAttentions({ order_id }))
    await delivery.updateDeliveryAttentions({
      id: attention.id,
      ...retimed(attention, ["due_at", "raised_at", "resolved_at"], retime),
    })
  for (const credit of await operations.listFoodCredits({ order_id }))
    await operations.updateFoodCredits({
      id: credit.id,
      ...retimed(credit, ["preparation_started_at", "ready_at"], retime),
    })
  for (const obligation of await operations.listRefundObligations({ order_id }))
    await operations.updateRefundObligations({
      id: obligation.id,
      ...retimed(obligation, ["last_attempted_at", "succeeded_at"], retime),
    })
  for (const attempt of await operations.listRefundAttempts({ order_id }))
    await operations.updateRefundAttempts({
      id: attempt.id,
      ...retimed(attempt, ["attempted_at"], retime),
    })
}

/**
 * Finance recognized the outcome when the seed reached it; after the
 * recorded times moved, it recognizes it again from the planned history.
 * Application code never removes a booked entry (spec #52 §3); this
 * synthetic seed does, only for the Order it has just created. The posting
 * time is set a few seconds after the qualifying moment, as prompt
 * recognition would have posted it, except for a late delivery, which stays
 * posted now: a linked adjustment of its original month.
 */
async function recognizeAtPlannedTime(
  container: MedusaContainer,
  planned: PopulationOrder,
  order_id: string,
) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const select = { select: ["id"], take: null }
  const receipts = await finance.listFinanceReceipts({ order_id }, select)
  await finance.deleteFinanceJournalEntries(
    (await finance.listFinanceJournalEntries({ order_id }, select)).map(
      ({ id }) => id,
    ),
  )
  await finance.deleteFinanceReceipts(receipts.map(({ id }) => id))
  const isDelivered = planned.outcome.startsWith("delivered")
  const outcome = isDelivered
    ? await recognizeDeliveredOrder(container, order_id)
    : await recognizeCancelledOrder(container, order_id)
  if (outcome !== "recognized")
    throw refuse(
      MedusaError.Types.UNEXPECTED_STATE,
      `Order ${order_id} (${planned.outcome}) was not recognized again: ${outcome}`,
    )
  if (planned.outcome === "delivered_late") return
  const posted_at = new Date(
    (
      planned.timeline.handed_over_at ?? planned.timeline.cancelled_at!
    ).getTime() + 3000,
  )
  const posting = { posted_at, posting_month: copenhagenMonthOf(posted_at) }
  for (const { id } of await finance.listFinanceReceipts({ order_id }, select))
    await finance.updateFinanceReceipts({ id, ...posting })
  for (const { id } of await finance.listFinanceJournalEntries(
    { order_id },
    select,
  ))
    await finance.updateFinanceJournalEntries({ id, ...posting })
}

/** One planned Order, from checkout to its recognized, retimed outcome. */
async function seedOrder(
  context: Context,
  planned: PopulationOrder,
  anchor: string,
) {
  const { container } = context
  const restaurant = context.restaurants.get(planned.restaurant)!
  const customer = context.customers.get(planned.customer)!
  const basket = planned.basket.map(({ handle, quantity }) => ({
    dish: restaurant.dishes.get(handle)!,
    quantity,
  }))
  const order = await placeDemoPaidOrder(container, {
    region_id: context.region_id,
    customer,
    dish: basket[0].dish,
    basket,
    postal_code: customer.postal_code,
    street: { address_1: customer.address_1, city: customer.city },
    metadata: { [POPULATION_KEY]: `${anchor}:${planned.slot}` },
  })
  await driveOutcome(context, planned, restaurant, order.id)
  await retimeOrder(container, planned, order.id)
  await recognizeAtPlannedTime(container, planned, order.id)
}

/**
 * Moves the Restaurant's creation, agreement and participation history to
 * the plan. The planned changes are recorded with the actor of the
 * activation the setup recorded, soft-deleted ones included, so a run
 * interrupted between deleting and recording repeats it. No workflow sets
 * `created_at` or a past participation change, so this synthetic seed writes
 * them on the Restaurant module directly.
 */
async function moveParticipation(
  container: MedusaContainer,
  restaurant_id: string,
  planned: StatementPopulation["restaurants"][number],
) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  await service.updateRestaurants({
    id: restaurant_id,
    created_at: planned.created_at,
  } as unknown as Parameters<typeof service.updateRestaurants>[0])
  const agreements = await service.listCommercialTermsAgreements(
    { restaurant_id },
    { select: ["id"], take: null },
  )
  for (const { id } of agreements)
    await service.updateCommercialTermsAgreements({
      id,
      agreed_at: new Date(planned.created_at.getTime() + 15 * 60 * 1000),
    })
  const recorded = await service.listRestaurantHistoryEntries(
    { restaurant_id, kind: ["activated", "deactivated"] },
    {
      select: [
        "id",
        "kind",
        "occurred_at",
        "actor_type",
        "actor_id",
        "actor_name",
        "deleted_at",
      ],
      order: { occurred_at: "ASC", id: "ASC" },
      take: null,
      withDeleted: true,
    },
  )
  const current = recorded.filter(({ deleted_at }) => !deleted_at)
  const signature = (changes: { kind: string; occurred_at: Date | string }[]) =>
    changes
      .map(
        ({ kind, occurred_at }) => `${kind}@${new Date(occurred_at).getTime()}`,
      )
      .join(",")
  if (signature(current) === signature(planned.changes)) return
  const actor = recorded.find(({ kind }) => kind === "activated") ?? recorded[0]
  if (!actor)
    throw refuse(
      MedusaError.Types.NOT_FOUND,
      `Restaurant ${restaurant_id} has no recorded activation`,
    )
  await service.softDeleteRestaurantHistoryEntries(current.map(({ id }) => id))
  await service.createRestaurantHistoryEntries(
    planned.changes.map(({ kind, occurred_at }) => ({
      restaurant_id,
      kind,
      occurred_at,
      actor_type: actor.actor_type,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      reason: kind === "deactivated" ? "Kitchen renovation" : null,
    })) as unknown as Parameters<
      typeof service.createRestaurantHistoryEntries
    >[0],
  )
}

/**
 * Once every Order exists: the Restaurants' creation, agreement and
 * participation move to the plan, the ended months' fees are recorded as
 * accrued at their end from the recorded history, those months close and
 * the current fee accrues. Only the seed's own Restaurants are changed.
 */
async function finalizeRestaurants(
  container: MedusaContainer,
  population: StatementPopulation,
  restaurants: SeededRestaurant[],
) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const now = new Date()
  for (const restaurant of restaurants) {
    const planned = population.restaurants.find(
      ({ key }) => key === restaurant.plan.key,
    )!
    await moveParticipation(container, restaurant.id, planned)
    const facts = (await readParticipation(container, [restaurant.id])).get(
      restaurant.id,
    )!
    for (const month of population.months) {
      const period = copenhagenMonthPeriod(month)
      if (period.ends_at > now || period.ends_at <= planned.created_at) continue
      const [held] = await finance.listFinanceServiceFees(
        { restaurant_id: restaurant.id, month },
        { take: 1, select: ["id"] },
      )
      const evidence = serviceFeeEvidence(facts, month, now)
      if (held || evidence.status !== "verified") continue
      await finance.createFinanceServiceFees({
        restaurant_id: restaurant.id,
        month,
        terms_version: evidence.terms_version,
        currency_code: "dkk",
        policy_amount: evidence.policy_amount,
        amount: evidence.amount,
        month_day_count: evidence.month_day_count,
        active_dates: evidence.active_dates,
        active_date_count: evidence.active_dates.length,
        accrued_at: new Date(period.ends_at.getTime() - 60 * 1000),
      } as unknown as Parameters<typeof finance.createFinanceServiceFees>[0])
    }
    await closeRestaurantStatements(container, restaurant.id)
    await reconcileClosedServiceFees(container, restaurant.id)
    await accrueServiceFee(container, restaurant.id)
  }
}

/** The Copenhagen date of the population's first run, kept by its Orders. */
function anchorDateOf(placed: { anchor_date: string }[], now: Date) {
  const dates = [...new Set(placed.map(({ anchor_date }) => anchor_date))]
  dates.sort((a, b) => a.localeCompare(b))
  return dates[0] ?? copenhagenDateOf(now)
}

export default async function seedStatementPopulation({ container }: ExecArgs) {
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

  const restaurants = new Map<string, SeededRestaurant>()
  for (const plan of POPULATION_RESTAURANTS)
    restaurants.set(plan.key, await populationRestaurant(container, plan))
  const restaurantIds = [...restaurants.values()].map(({ id }) => id)
  const placed = await placedOrders(container, restaurantIds)
  const anchor = anchorDateOf(placed, now)
  const population = planStatementPopulation({ anchor_date: anchor })
  const { finished, unfinished } = await finishedOrders(
    container,
    population,
    placed.filter(({ anchor_date }) => anchor_date === anchor),
  )
  if (unfinished.length) {
    logger.info(
      `Statement population: discarding ${unfinished.length} unfinished Orders of an interrupted run`,
    )
    await discardOrders(container, unfinished)
  }
  const context: Context = {
    container,
    region_id: region.id,
    operator_id: await populationOperator(container),
    restaurants,
    customers: await populationCustomers(container, population.customers),
    agents: await populationAgents(container, population.agents),
  }
  const missing = population.orders.filter(({ slot }) => !finished.has(slot))
  logger.info(
    `Statement population for ${anchor}: ${finished.size} Orders already seeded, creating ${missing.length}`,
  )
  for (const [done, planned] of missing.entries()) {
    await seedOrder(context, planned, anchor)
    if ((done + 1) % 25 === 0)
      logger.info(
        `Statement population: ${done + 1} of ${missing.length} Orders`,
      )
  }
  await finalizeRestaurants(container, population, [...restaurants.values()])
  logger.info(
    [
      `Statement population for ${population.months.join(", ")}: ${population.customers.length} Customers, ${population.orders.length} Orders at ${POPULATION_RESTAURANTS.map(({ name }) => name).join(", ")}.`,
      "Reconcile and time the statement reads with the backend running and MTOGO_FF_RESTAURANT_STATEMENTS=true:",
      "  npx medusa exec ./src/scripts/check-statement-population.ts",
    ].join("\n"),
  )
}
