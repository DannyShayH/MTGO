/**
 * 500 delivered, rated Orders for Feedback demos and the operator statistics
 * (#220), plus one delivered Order the Customer can still rate and one whose
 * 168-hour window has closed. Run from apps/backend against a local,
 * disposable or staging database:
 *
 *   DEMO_FEEDBACK_CUSTOMER_EMAIL=<email> npx medusa exec ./src/scripts/seed-demo-feedback.ts
 *
 * The email names an existing Customer account (register in the storefront
 * first); every Order belongs to it, so one sign-in shows each Feedback
 * state. The script creates or reuses four demo Restaurants in Nørrebro and
 * five demo agents. Each Order buys one to three pizzas, often with a drink,
 * and is placed, accepted, prepared, claimed, picked up and handed over
 * through the real workflows; each rating is recorded by the real Feedback
 * workflow. The Order's recorded
 * times are then moved back together, so the handovers spread over the
 * previous and the current calendar month.
 *
 * Each Order carries its slot (`rated-0` ... `rated-499`, `open`, `closed`)
 * in its metadata. A second run keeps the finished slots and creates only
 * the missing ones, so it never adds a second set of Feedback. It also adds
 * a new open Order once the previous one was rated or its window closed. It
 * moves the kept Orders to the current plan's times too, so the data follows
 * the calendar and an Order a crash left at today's date is corrected. An
 * interrupted run can leave one unfinished Order in the Customer's history;
 * the next run replaces its slot.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  placeDemoPaidOrder,
  type DemoBasketLine,
  type DemoDish,
} from "../lib/demo-paid-order"
import {
  isPoorFoodFromGoodAgent,
  isSeededSlotKept,
  planDemoFeedback,
  type DemoSlot,
  type PlannedOrder,
  type PlannedRatedOrder,
} from "../lib/demo-feedback-plan"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { FEEDBACK_MODULE } from "../modules/feedback"
import type FeedbackModuleService from "../modules/feedback/service"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { claimDeliveryWorkflow } from "../workflows/delivery/assignment"
import { confirmPickupWorkflow } from "../workflows/delivery/pickup"
import { confirmHandoverWorkflow } from "../workflows/delivery/terminal"
import { submitFeedbackWorkflow } from "../workflows/feedback"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import {
  acceptPartnerOrderWorkflow,
  markPartnerOrderReadyWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../workflows/order-operations"
import { openRestaurantWorkflow } from "../workflows/restaurant-staff"
import { demoRestaurant } from "./seed-demo-failed-refund"

const SLOT_KEY = "demo_feedback_220"
/** The demo Restaurants; `runId` keys their staff email addresses. */
const RESTAURANTS = [
  { runId: "A", name: "Pizzeria Fælledvej", street: "Fælledvej 12" },
  { runId: "B", name: "Trattoria Guldberg", street: "Guldbergsgade 31" },
  { runId: "C", name: "Nørrebro Pizzabar", street: "Nørrebrogade 88" },
  { runId: "D", name: "Jægersborg Stenovn", street: "Jægersborggade 7" },
]
const AGENT_NAMES = [
  "Mikkel Jensen",
  "Sofie Nielsen",
  "Ahmed Hansen",
  "Freja Pedersen",
  "Jonas Larsen",
]
const POSTAL_CODE = "2200"

type FeedbackDemoRestaurant = {
  id: string
  name: string
  staff_id: string
  /** The orderable dishes: the pizza first, then the drink when listed. */
  dishes: DemoDish[]
}
type SeededOrder = { order_id: string; display_id: number }
type PlannedSlot = {
  slot: DemoSlot
  planned: PlannedOrder & Partial<PlannedRatedOrder>
}

function assertPresent<T>(
  value: T,
  message: string,
  type: string = MedusaError.Types.NOT_FOUND,
): asserts value is NonNullable<T> {
  if (!value) throw new MedusaError(type, message)
}

/**
 * The demo Restaurant: created on the first run, reopened on a later one if
 * staff closed it.
 */
async function findOrCreateRestaurant(
  container: MedusaContainer,
  identity: (typeof RESTAURANTS)[number],
): Promise<FeedbackDemoRestaurant> {
  const { name } = identity
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [existing],
  } = await query.graph({
    entity: "restaurant",
    fields: ["id", "is_open"],
    filters: { name },
  })
  let id: string
  let staffId: string
  if (existing) {
    const {
      data: [staff],
    } = await query.graph({
      entity: "restaurant_staff",
      fields: ["id"],
      filters: { restaurant_id: existing.id, status: "authorized" },
    })
    assertPresent(staff, `${name} has no authorized staff`)
    if (!existing.is_open)
      await openRestaurantWorkflow(container).run({
        input: { restaurant_id: existing.id, staff_id: staff.id },
      })
    id = existing.id
    staffId = staff.id
  } else {
    const created = await demoRestaurant(container, identity.runId, {
      name,
      street: identity.street,
      slug: "feedback",
      showcase: true,
    })
    id = created.id
    staffId = created.staff_id
  }
  const menu = await readRestaurantWithMenu(container, id)
  const dishes = (menu?.menu ?? [])
    .flatMap((category) => category.dishes)
    .filter((candidate) => !candidate.is_sold_out)
  assertPresent(dishes[0], `${name} has no orderable dish`)
  return { id, name, staff_id: staffId, dishes }
}

/** The numbered demo agent, authorized for the demo Restaurants' area. */
async function findOrCreateAgent(container: MedusaContainer, index: number) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const email = `feedback-demo-agent-${index + 1}@example.test`
  const [existing] = await delivery.listDeliveryAgents({ email }, { take: 1 })
  if (existing) return existing.id
  const agent = await delivery.createDeliveryAgents({
    name: AGENT_NAMES[index],
    email,
    status: "authorized",
    invited_by: "seed",
    accepted_at: new Date(),
  })
  await delivery.createDeliveryAgentAreas({
    agent_id: agent.id,
    postal_code: POSTAL_CODE,
  })
  return agent.id
}

/** The Customer's seeded Orders that this run keeps, by slot. */
async function readKeptSlots(
  container: MedusaContainer,
  customerId: string,
  now: Date,
) {
  const { data: orders } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["id", "display_id", "metadata"],
      filters: { customer_id: customerId },
    })
  const seeded = (
    orders as unknown as {
      id: string
      display_id: number
      metadata?: Record<string, unknown> | null
    }[]
  ).filter(({ metadata }) => typeof metadata?.[SLOT_KEY] === "string")
  const kept = new Map<DemoSlot, SeededOrder>()
  if (!seeded.length) return kept
  const ids = seeded.map(({ id }) => id)
  const deliveredAt = new Map(
    (
      await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .listIntendedDeliveries(
          { order_id: ids, terminal_outcome: "delivered" },
          { select: ["order_id", "terminal_at"] },
        )
    ).map(({ order_id, terminal_at }) => [order_id, new Date(terminal_at!)]),
  )
  const rated = new Set(
    (
      await container
        .resolve<FeedbackModuleService>(FEEDBACK_MODULE)
        .listFeedbacks({ order_id: ids }, { select: ["order_id"] })
    ).map(({ order_id }) => order_id),
  )
  for (const { id, display_id, metadata } of seeded) {
    const slot = metadata![SLOT_KEY] as DemoSlot
    const isKept = isSeededSlotKept({
      slot,
      delivered_at: deliveredAt.get(id) ?? null,
      isRated: rated.has(id),
      now,
    })
    if (isKept) kept.set(slot, { order_id: id, display_id })
  }
  return kept
}

/** `fields` of `record` moved by `shift` ms, leaving unset times unset. */
function shiftTimes<T extends object>(
  record: T,
  fields: (keyof T & string)[],
  shift: number,
) {
  const update: Record<string, Date> = {}
  for (const field of fields) {
    const value = record[field] as unknown as Date | string | null | undefined
    if (value) update[field] = new Date(new Date(value).getTime() + shift)
  }
  return update
}

/**
 * Moves the Order's recorded times back together, so its handover is at
 * `delivered_at` and its Feedback, if any, was given at `rated_at`. Running
 * it again with the same times changes nothing.
 * Application code never rewrites recorded milestones or Feedback (ADR-0021,
 * ADR-0010); this synthetic seed does, and only on the databases
 * `syntheticSeedAllowed` accepts. The field lists name every recorded time
 * of these records: add a new one here too.
 */
export async function backdate(
  container: MedusaContainer,
  orderId: string,
  delivered_at: Date,
  rated_at?: Date,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [handover] = await delivery.listIntendedDeliveries({
    order_id: orderId,
  })
  const shift =
    delivered_at.getTime() - new Date(handover.terminal_at!).getTime()
  // The Order date the Customer's history shows. Coding standard 5.1 sends
  // commerce changes through core-flows so links, events and inventory stay
  // consistent; no core-flow sets `created_at`, and moving it touches none of
  // those, so this synthetic seed writes it on the Order module directly. The
  // update's type omits `created_at`, but the module writes it.
  const orders = container.resolve(Modules.ORDER)
  const order = await orders.retrieveOrder(orderId, { select: ["created_at"] })
  await orders.updateOrders(orderId, shiftTimes(order, ["created_at"], shift))
  await delivery.updateIntendedDeliveries({
    id: handover.id,
    ...shiftTimes(
      handover,
      [
        "accepted_at",
        "claim_deadline",
        "assigned_at",
        "picked_up_at",
        "native_sync_queued_at",
        "arrived_at",
        "trip_measured_at",
        "terminal_at",
        "native_delivered_at",
        "order_outcome_recorded_at",
      ],
      shift,
    ),
  })
  for (const attention of await delivery.listDeliveryAttentions({
    order_id: orderId,
  }))
    await delivery.updateDeliveryAttentions({
      id: attention.id,
      ...shiftTimes(attention, ["due_at", "raised_at", "resolved_at"], shift),
    })
  const [operation] = await operations.listOrderOperations({
    order_id: orderId,
  })
  await operations.updateOrderOperations({
    id: operation.id,
    ...shiftTimes(
      operation,
      [
        "placed_at",
        "acceptance_deadline",
        "accepted_at",
        "preparation_started_at",
        "ready_at",
        "delivery_ended_at",
        "delivery_picked_up_at",
        "delivery_assigned_at",
      ],
      shift,
    ),
  })
  for (const credit of await operations.listFoodCredits({ order_id: orderId }))
    await operations.updateFoodCredits({
      id: credit.id,
      ...shiftTimes(credit, ["preparation_started_at", "ready_at"], shift),
    })
  if (rated_at) {
    const feedback = container.resolve<FeedbackModuleService>(FEEDBACK_MODULE)
    const [recorded] = await feedback.listFeedbacks({ order_id: orderId })
    // The generated update omits `created_at` from its type but writes it.
    const update = { id: recorded.id, delivered_at, created_at: rated_at }
    await feedback.updateFeedbacks(update)
  }
}

/**
 * One to three pizzas, and a drink on three Orders in five, so the Orders'
 * baskets and totals differ.
 */
function demoBasket(
  restaurant: FeedbackDemoRestaurant,
  position: number,
): DemoBasketLine[] {
  const [pizza, drink] = restaurant.dishes
  const drinks = (position % 5) % 3
  return [
    { dish: pizza, quantity: 1 + (position % 3) },
    ...(drink && drinks ? [{ dish: drink, quantity: drinks }] : []),
  ]
}

/** One planned Order, from checkout to recorded Feedback, then moved back. */
async function seedOrder(
  container: MedusaContainer,
  input: {
    region_id: string
    customer: { id: string; email: string }
    restaurant: FeedbackDemoRestaurant
    agent_id: string
    position: number
  } & PlannedSlot,
) {
  const { restaurant, planned } = input
  const order = await placeDemoPaidOrder(container, {
    region_id: input.region_id,
    customer: input.customer,
    dish: restaurant.dishes[0],
    basket: demoBasket(restaurant, input.position),
    postal_code: POSTAL_CODE,
    metadata: { [SLOT_KEY]: input.slot },
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
  if (planned.food_rating)
    await submitFeedbackWorkflow(container).run({
      input: {
        order_id: order.id,
        customer_id: input.customer.id,
        ratings: {
          food_rating: planned.food_rating,
          experience_rating: planned.experience_rating!,
          agent_rating: planned.agent_rating!,
        },
      },
    })
  await backdate(container, order.id, planned.delivered_at, planned.rated_at)
  return { order_id: order.id, display_id: order.display_id }
}

export default async function seedDemoFeedback({ container }: ExecArgs) {
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
      "synthetic_seed_database_required",
    )
  const email = process.env.DEMO_FEEDBACK_CUSTOMER_EMAIL?.trim().toLowerCase()
  assertPresent(
    email,
    "Set DEMO_FEEDBACK_CUSTOMER_EMAIL to a Customer account",
    MedusaError.Types.INVALID_DATA,
  )
  const [customer] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email, has_account: true })
  assertPresent(
    customer,
    "No Customer account for DEMO_FEEDBACK_CUSTOMER_EMAIL",
  )
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  assertPresent(region, "No DKK region; run the backend migrations first")
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const restaurants: FeedbackDemoRestaurant[] = []
  for (const identity of RESTAURANTS)
    restaurants.push(await findOrCreateRestaurant(container, identity))
  const agents: string[] = []
  for (const index of AGENT_NAMES.keys())
    agents.push(await findOrCreateAgent(container, index))

  const now = new Date()
  const plan = planDemoFeedback({
    now,
    restaurants: restaurants.length,
    agents: agents.length,
  })
  const kept = await readKeptSlots(container, customer.id, now)
  const slots: PlannedSlot[] = [
    ...plan.rated.map((planned, index) => ({
      slot: `rated-${index}` as DemoSlot,
      planned,
    })),
    { slot: "open", planned: plan.open },
    { slot: "closed", planned: plan.closed },
  ]
  const missing = slots
    .map((slot, position) => ({ ...slot, position }))
    .filter(({ slot }) => !kept.has(slot))
  logger.info(
    `Feedback demo: ${kept.size} Orders already seeded, creating ${missing.length}`,
  )
  // Kept Orders follow this run's plan, so their dates track the calendar.
  for (const { slot, planned } of slots) {
    const existing = kept.get(slot)
    if (existing)
      await backdate(
        container,
        existing.order_id,
        planned.delivered_at,
        planned.rated_at,
      )
  }
  for (const [done, { slot, planned, position }] of missing.entries()) {
    kept.set(
      slot,
      await seedOrder(container, {
        region_id: region.id,
        customer,
        restaurant: restaurants[planned.restaurant],
        agent_id: agents[planned.agent],
        position,
        slot,
        planned,
      }),
    )
    if ((done + 1) % 25 === 0)
      logger.info(`Feedback demo: ${done + 1} of ${missing.length} Orders`)
  }

  // The Customer's email stays out of the log (coding standard, logging).
  const orderNumber = (slot: DemoSlot) => `#${kept.get(slot)!.display_id}`
  const contrast: DemoSlot = `rated-${plan.rated.findIndex(isPoorFoodFromGoodAgent)}`
  logger.info(
    [
      `Feedback demo: ${plan.rated.length} rated Orders at ${restaurants.map(({ name }) => name).join(", ")}.`,
      "Sign in to the storefront with the DEMO_FEEDBACK_CUSTOMER_EMAIL account and its password,",
      "and open the Orders under Account:",
      `  ${orderNumber("open")}  delivered two days ago; the rating form is open`,
      `  ${orderNumber("closed")}  delivered nine days ago without Feedback; the window has closed`,
      `  ${orderNumber(contrast)}  rated: poor food, five-star agent`,
      `  ${orderNumber("rated-499")}  rated (the newest); every other demo Order is rated too`,
    ].join("\n"),
  )
}
