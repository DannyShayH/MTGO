/**
 * The demo world (#258): three Copenhagen months of believable platform
 * activity with Restaurant Scarpetta as the prime Restaurant, so ratings
 * (#51), statements (#52), bonuses (#53) and operations figures (#54) are
 * demonstrated on one set of facts. Run from apps/backend against a local,
 * disposable or staging database:
 *
 *   DEMO_WORLD_PASSWORD=<8+ characters> DEMO_WORLD_EMAIL_DOMAIN=<team domain> \
 *     npx medusa exec ./src/scripts/seed-demo-world.ts
 *
 * On staging, `sudo mtogo-deploy.sh demo-seed` runs it in the current
 * release's container (deploy/staging/README.md).
 *
 * It creates or reuses the plan's Restaurants (`src/lib/demo-world`), one
 * authorized staff member each, an operator, the Delivery agents and the
 * Customers, all signed in with DEMO_WORLD_PASSWORD and already verified.
 * Scarpetta is found by its staging id or its name and used as it is: the
 * seed only adds its missing dishes and its staff member, and moves its
 * creation and first activation to the start of the window. Every Order is
 * placed through the real cart, mock payment and completion workflows and
 * ends through the real workflows; Feedback is given through the Feedback
 * workflow. Its recorded times are then moved onto its planned history and
 * finance recognizes it again from there, as the statement population seed
 * does. When the history is complete, the Restaurants' participation moves
 * to the plan and the ended months close.
 *
 * Every Order carries its slot in its metadata (`demo_world_258`). A rerun
 * keeps finished slots, discards the unfinished ones of an interrupted run
 * and creates only the missing ones, so it adds the days, and the part of
 * today, that passed since. Every run also adds a fresh "now": Open Orders
 * in each stage, an unassigned delivery waiting over ten minutes, stalled
 * deliveries and a reported problem, and pending and failed Full refunds.
 * Those are live: the backend's recovery jobs move them on like any other
 * Order, so run the seed shortly before a demonstration. A rerun first
 * delivers the earlier runs' "now" Orders that an agent still holds, so
 * every agent is free for the history and the new "now".
 *
 * DEMO_WORLD_SCALE (default 1) multiplies every Restaurant's daily volume,
 * and DEMO_WORLD_MAX_ORDERS stops after that many new history Orders, for a
 * timed trial run. The seed sends no email and prints neither the password
 * nor any Customer's email address. It refuses any database that is not
 * local, disposable CI or staging.
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
  asciiOf,
  DEMO_WORLD_KEY,
  NOW_SLOT_PREFIX,
  planDemoWorld,
  planNowOrders,
  retimerNearest,
  type DemoWorldCustomer,
  type DemoWorldNowOrder,
  type DemoWorldOrder,
  type DemoWorldPlan,
} from "../lib/demo-world/plan"
import {
  DEMO_WORLD_RESTAURANTS,
  type DemoWorldDish,
  type DemoWorldRestaurant,
} from "../lib/demo-world/restaurants"
import { qualifyingMoment } from "../lib/statement-population-plan"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { FEEDBACK_MODULE } from "../modules/feedback"
import type FeedbackModuleService from "../modules/feedback/service"
import { FOOD_CATALOGUE_MODULE } from "../modules/food-catalogue"
import type FoodCatalogueModuleService from "../modules/food-catalogue/service"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import type RestaurantModuleService from "../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../modules/restaurant-finance/service"
import { claimDeliveryWorkflow } from "../workflows/delivery/assignment"
import { recoverDeliveryAttentionWorkflow } from "../workflows/delivery/attention"
import {
  stalledAttentionDueAt,
  unassignedAttentionDueAt,
} from "../workflows/delivery/attention-rules"
import { confirmPickupWorkflow } from "../workflows/delivery/pickup"
import { reportDeliveryProblemWorkflow } from "../workflows/delivery/problem-report"
import { confirmHandoverWorkflow } from "../workflows/delivery/terminal"
import { submitFeedbackWorkflow } from "../workflows/feedback"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import { mutateMenuCategoryWorkflow } from "../workflows/menu-categories"
import {
  createMenuDishWorkflow,
  editMenuDishWorkflow,
} from "../workflows/menu-dishes"
import type {
  AllergenDeclaration,
  FoodLabelDeclaration,
} from "../workflows/menu-dishes/validation"
import {
  acceptPartnerOrderWorkflow,
  cancelAcceptedOrderWorkflow,
  cancelCustomerOrderWorkflow,
  markPartnerOrderReadyWorkflow,
  rejectPartnerOrderWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../workflows/order-operations"
import { settleCancellation } from "../workflows/order-operations/cancellation"
import { orderSettlementLock } from "../workflows/order-operations/locks"
import { SYSTEM_ACTOR } from "../workflows/order-operations/rules"
import { expireDueOrder } from "../workflows/order-operations/steps/recover-order-operations"
import { expireUnassignedDelivery } from "../workflows/order-operations/unassigned-cancellation"
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
import { statementMonths } from "../workflows/restaurant-finance/statement-rules"
import { COMMON_MVP_TERMS_V1 } from "../workflows/restaurants/commercial-terms"
import { copenhagenDateOf } from "../workflows/shared/copenhagen-time"
import {
  closeSeededMonths,
  discardOrders,
  moveParticipation,
  recognizeAtPlannedTime,
  retimeOrder,
} from "./seed-statement-population"

/** The operator who records terms, activates and cancels, as an Admin user. */
export const OPERATOR = { first_name: "Nadia", last_name: "Kjær" }

const AGENT_PROVIDER = "delivery-agent-emailpass"
const CUSTOMER_PROVIDER = "customer-emailpass"
const STAFF_PROVIDER = "emailpass"

type SeededRestaurant = {
  id: string
  plan: DemoWorldRestaurant
  staff_id: string
  staff_email: string
  /** Orderable dishes by plan key. */
  dishes: Map<string, DemoDish>
}

type Context = {
  container: MedusaContainer
  plan: DemoWorldPlan
  region_id: string
  operator_id: string
  restaurants: Map<string, SeededRestaurant>
  customers: Map<string, DemoWorldCustomer & { id: string }>
  agents: string[]
  /**
   * Agents still carrying an open delivery, such as an earlier run's "now"
   * Orders: an agent carries one delivery at a time, so they sit out.
   */
  busy: Set<string>
}

const refuse = (type: string, message: string) => new MedusaError(type, message)

type Settings = ReturnType<typeof settings>

function settings() {
  const password = process.env.DEMO_WORLD_PASSWORD ?? ""
  const domain = process.env.DEMO_WORLD_EMAIL_DOMAIN?.trim().toLowerCase()
  if (password.length < 8)
    throw refuse(
      MedusaError.Types.INVALID_DATA,
      "Set DEMO_WORLD_PASSWORD (at least 8 characters) for every seeded login",
    )
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
    throw refuse(
      MedusaError.Types.INVALID_DATA,
      "Set DEMO_WORLD_EMAIL_DOMAIN to the team's own email domain",
    )
  const scale = Number(process.env.DEMO_WORLD_SCALE ?? "1")
  const max = Number(process.env.DEMO_WORLD_MAX_ORDERS ?? "Infinity")
  const workers = Number(process.env.DEMO_WORLD_WORKERS ?? "6")
  // Not a number is refused too.
  const isPositive = (value: number) => value > 0
  if (
    ![scale, max].every(isPositive) ||
    !Number.isInteger(workers) ||
    workers < 1
  )
    throw refuse(
      MedusaError.Types.INVALID_DATA,
      "DEMO_WORLD_SCALE, DEMO_WORLD_MAX_ORDERS and DEMO_WORLD_WORKERS must be positive",
    )
  return { password, domain, scale, max, workers }
}

/**
 * A login for `email` on `provider` with the demo password: registered on
 * the first run, its password set again on a later one.
 */
async function ensureLogin(
  container: MedusaContainer,
  provider: string,
  email: string,
  password: string,
  body: Record<string, unknown> = {},
) {
  const auth = container.resolve(Modules.AUTH)
  const [existing] = await auth.listProviderIdentities(
    { provider, entity_id: email },
    { take: 1 },
  )
  if (existing) {
    const { success, error } = await auth.updateProvider(provider, {
      entity_id: email,
      password,
    })
    if (!success)
      throw refuse(
        MedusaError.Types.UNEXPECTED_STATE,
        `login_password_not_set: ${error ?? "unknown reason"}`,
      )
    return auth.retrieveAuthIdentity(existing.auth_identity_id!)
  }
  const { authIdentity, error } = await auth.register(provider, {
    body: { email, password, ...body } as unknown as Record<string, string>,
  })
  if (!authIdentity)
    throw refuse(
      MedusaError.Types.INVALID_DATA,
      `login_not_registered: ${error ?? "unknown reason"}`,
    )
  return authIdentity
}

/** The operator as a Medusa Admin user who can sign in to the Admin. */
async function demoOperator(
  container: MedusaContainer,
  email: string,
  password: string,
) {
  const users = container.resolve(Modules.USER)
  const [existing] = await users.listUsers({ email })
  const user = existing ?? (await users.createUsers({ email, ...OPERATOR }))
  const identity = await ensureLogin(container, STAFF_PROVIDER, email, password)
  if (identity.app_metadata?.user_id !== user.id)
    await container.resolve(Modules.AUTH).updateAuthIdentities({
      id: identity.id,
      app_metadata: { ...identity.app_metadata, user_id: user.id },
    })
  return user.id
}

/** Allergen and food label declarations from the catalogue's codes. */
async function declarationsFor(container: MedusaContainer) {
  const catalogue = container.resolve<FoodCatalogueModuleService>(
    FOOD_CATALOGUE_MODULE,
  )
  const [allergens, details, labels] = await Promise.all([
    catalogue.listAllergens({}, { take: null }),
    catalogue.listAllergenDetails({}, { take: null }),
    catalogue.listFoodLabels({}, { take: null }),
  ])
  const allergenId = new Map(allergens.map(({ code, id }) => [code, id]))
  const detailId = new Map(details.map(({ code, id }) => [code, id]))
  const entry = (spec: string) => {
    const [code, detail] = spec.replace(/^~/, "").split(":")
    const allergen_id = allergenId.get(code)
    if (!allergen_id)
      throw refuse(MedusaError.Types.NOT_FOUND, `Unknown allergen ${code}`)
    return {
      allergen_id,
      detail_ids: (detail ? detail.split("+") : []).map((code) => {
        const id = detailId.get(code)
        if (!id)
          throw refuse(MedusaError.Types.NOT_FOUND, `Unknown detail ${code}`)
        return id
      }),
    }
  }
  return (dish: DemoWorldDish) => {
    const allergens: AllergenDeclaration = {
      status: "supplied",
      contains: dish.allergens.filter((a) => !a.startsWith("~")).map(entry),
      may_contain: dish.allergens.filter((a) => a.startsWith("~")).map(entry),
      none_declared: dish.allergens.length === 0,
    }
    const food_labels: FoodLabelDeclaration = labels.map(({ id, code }) => ({
      food_label_id: id,
      state: dish.labels?.includes(code as "chili") ? "yes" : "no",
    }))
    return { allergens, food_labels }
  }
}

/**
 * Adds the plan's categories and dishes the Restaurant does not have yet,
 * through the same workflows the partner app uses. An existing dish of the
 * same Danish name is kept as it is, with its photo and settings.
 */
async function completeMenu(
  container: MedusaContainer,
  restaurant: { id: string; plan: DemoWorldRestaurant; staff_id: string },
  declare: Awaited<ReturnType<typeof declarationsFor>>,
) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const { id: restaurant_id, plan, staff_id } = restaurant
  const staffRun = { restaurant_id, staff_id }
  const published = async () =>
    (await readRestaurantWithMenu(container, restaurant_id))?.menu ?? []
  const names = new Set(
    (await published()).flatMap(({ dishes }) =>
      dishes.map(({ name }) => name.da),
    ),
  )
  let added = 0
  for (const planned of plan.menu) {
    const categories = await service.listMenuCategories(
      { restaurant_id, is_removed: false },
      { select: ["id", "name_da"], take: null },
    )
    let category = categories.find(({ name_da }) => name_da === planned.name.da)
    if (!category) {
      await mutateMenuCategoryWorkflow(container).run({
        input: {
          ...staffRun,
          kind: "create",
          name: planned.name,
          request_id: `dw-${plan.key}-${planned.key}`,
          revision: 0,
        },
      })
      ;[category] = await service.listMenuCategories(
        { restaurant_id, is_removed: false, name_da: planned.name.da },
        { select: ["id", "name_da"], take: 1 },
      )
    }
    for (const dish of planned.dishes) {
      if (names.has(dish.name.da)) continue
      const declared = declare(dish)
      await createMenuDishWorkflow(container).run({
        input: {
          ...staffRun,
          request_id: `dw-${plan.key}-${dish.key}`,
          category_id: category!.id,
          name: dish.name,
          price: String(dish.price),
          ...declared,
        },
      })
      names.add(dish.name.da)
      added++
      if (!dish.description) continue
      const created = (await published())
        .flatMap(({ dishes }) => dishes)
        .find(({ name }) => name.da === dish.name.da)!
      await editMenuDishWorkflow(container).run({
        input: {
          ...staffRun,
          dish_id: created.id,
          request_id: `dw-${plan.key}-${dish.key}-text`,
          revision: created.revision,
          name: dish.name,
          description: dish.description,
          price: String(dish.price),
          ...declared,
        },
      })
    }
  }
  return added
}

/** The plan's Restaurant, found or created, open, with its staff and menu. */
async function demoRestaurant(
  context: Pick<Context, "container" | "operator_id" | "plan">,
  plan: DemoWorldRestaurant,
  options: Settings,
  declare: Awaited<ReturnType<typeof declarationsFor>>,
): Promise<SeededRestaurant> {
  const { container, operator_id } = context
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const select = ["id", "name", "is_active", "is_open"]
  let [record] = plan.existing_id
    ? await service.listRestaurants({ id: plan.existing_id }, { select })
    : []
  if (!record)
    [record] = await service.listRestaurants({ name: plan.name }, { select })
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
        contact_email: `${plan.contact}@${options.domain}`,
      },
    })
    record = {
      id: restaurant.id,
      is_active: false,
      is_open: false,
    } as typeof record
  }
  const restaurant_id = record.id
  const areas = new Set(
    (
      await service.listDeliveryAreaPostalCodes(
        { restaurant_id },
        { select: ["postal_code"], take: null },
      )
    ).map(({ postal_code }) => postal_code),
  )
  const add = plan.delivery_area.filter((code) => !areas.has(code))
  if (add.length)
    await changeDeliveryAreaWorkflow(container).run({
      input: { restaurant_id, add, remove: [] },
    })
  const [agreement] = await service.listCommercialTermsAgreements(
    { restaurant_id },
    { take: 1, select: ["id"] },
  )
  if (!agreement)
    await recordCommercialTermsWorkflow(container).run({
      input: {
        restaurant_id,
        terms_version: COMMON_MVP_TERMS_V1.terms_version,
        recorded_by: operator_id,
      },
    })

  const staff = context.plan.staff.find((s) => s.restaurant === plan.key)!
  const identity = await ensureLogin(
    container,
    STAFF_PROVIDER,
    staff.email,
    options.password,
  )
  let [member] = await service.listRestaurantStaffs(
    { restaurant_id, email: staff.email, status: "authorized" },
    { take: 1, select: ["id"] },
  )
  if (!member) {
    const { result } = await createAuthorizedStaffWorkflow(container).run({
      input: {
        restaurant_id,
        name: staff.name,
        email: staff.email,
        auth_identity_id: identity.id,
      },
    })
    member = { id: result.id } as typeof member
  }
  await completeMenu(
    container,
    { id: restaurant_id, plan, staff_id: member.id },
    declare,
  )
  if (!record.is_active)
    await activateRestaurantWorkflow(container).run({
      input: { restaurant_id, operator_id },
    })
  if (!record.is_open)
    await openRestaurantWorkflow(container).run({
      input: { restaurant_id, staff_id: member.id },
    })

  const menu =
    (await readRestaurantWithMenu(container, restaurant_id))?.menu ?? []
  const byName = new Map(
    menu.flatMap(({ dishes }) => dishes).map((dish) => [dish.name.da, dish]),
  )
  const dishes = new Map<string, DemoDish>()
  for (const planned of plan.menu.flatMap(({ dishes }) => dishes)) {
    const published = byName.get(planned.name.da)
    // A dish the Restaurant marked sold out is simply not ordered.
    if (published && !published.is_sold_out)
      dishes.set(planned.key, published as unknown as DemoDish)
  }
  if (!dishes.size)
    throw refuse(MedusaError.Types.NOT_FOUND, `${plan.name} sells nothing`)
  return {
    id: restaurant_id,
    plan,
    staff_id: member.id,
    staff_email: staff.email,
    dishes,
  }
}

/** The plan's Customers: accounts with an address, verified logins. */
async function demoCustomers(
  container: MedusaContainer,
  planned: DemoWorldCustomer[],
  password: string,
) {
  const service = container.resolve(Modules.CUSTOMER)
  const auth = container.resolve(Modules.AUTH)
  const existing = await service.listCustomers(
    { email: planned.map(({ email }) => email), has_account: true },
    { take: null, select: ["id", "email"] },
  )
  const idOf = new Map(existing.map(({ id, email }) => [email, id]))
  const missing = planned.filter(({ email }) => !idOf.has(email))
  for (let start = 0; start < missing.length; start += 50) {
    const { result } = await createCustomersWorkflow(container).run({
      input: {
        customersData: missing.slice(start, start + 50).map((customer) => ({
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          has_account: true,
          metadata: { [DEMO_WORLD_KEY]: customer.key },
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
  for (const customer of planned) {
    const customer_id = idOf.get(customer.email)!
    const identity = await ensureLogin(
      container,
      CUSTOMER_PROVIDER,
      customer.email,
      password,
    )
    if (identity.app_metadata?.customer_id !== customer_id)
      await auth.updateAuthIdentities({
        id: identity.id,
        app_metadata: { ...identity.app_metadata, customer_id },
      })
    // Verified, as if the Customer had followed the link; no email is sent.
    const [verified] = await auth.listAuthVerifications({
      auth_identity_id: identity.id,
      entity_id: customer.email,
      entity_type: "email",
    })
    if (!verified?.verified_at) {
      const request = await auth.requestAuthVerification({
        auth_identity_id: identity.id,
        entity_id: customer.email,
        entity_type: "email",
        code_provider: "token",
      })
      await auth.confirmAuthVerification({
        code: request.code!,
        code_provider: "token",
      })
    }
  }
  return new Map(
    planned.map((customer) => [
      customer.key,
      { ...customer, id: idOf.get(customer.email)! },
    ]),
  )
}

/** The plan's Delivery agents: authorized logins for every seeded area. */
async function demoAgents(
  container: MedusaContainer,
  plan: DemoWorldPlan,
  operator_id: string,
  password: string,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const auth = container.resolve(Modules.AUTH)
  const postal_codes = [
    ...new Set(
      DEMO_WORLD_RESTAURANTS.flatMap(({ delivery_area }) => delivery_area),
    ),
  ]
  const ids: string[] = []
  for (const planned of plan.agents) {
    const [existing] = await delivery.listDeliveryAgents(
      { email: planned.email, status: ["pending", "authorized"] },
      { take: 1 },
    )
    const agent =
      existing ??
      (await delivery.createDeliveryAgents({
        name: planned.name,
        email: planned.email,
        status: "authorized",
        invited_by: operator_id,
        accepted_at: plan.from,
      }))
    const identity = await ensureLogin(
      container,
      AGENT_PROVIDER,
      planned.email,
      password,
      {
        agent_registration_guard: (operation: (recovery: boolean) => unknown) =>
          operation(true),
      },
    )
    if (identity.app_metadata?.delivery_agent_id !== agent.id)
      await auth.updateAuthIdentities({
        id: identity.id,
        app_metadata: { ...identity.app_metadata, delivery_agent_id: agent.id },
      })
    await delivery.replaceApprovedAreas({ agent_id: agent.id, postal_codes })
    ids.push(agent.id)
  }
  return ids
}

/** Seeded Orders of the Restaurants already placed: slot and Order id. */
export type Placed = {
  order_id: string
  slot: string
  placed_at: Date | string | null
  accepted_at: Date | string | null
}

const timeOf = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : null

/** Whether the recorded placement and acceptance are the planned ones. */
const isOnPlan = (order: Placed, planned: DemoWorldOrder) =>
  timeOf(order.placed_at) ===
    (planned.legacy ? null : timeOf(planned.timeline.placed_at)) &&
  timeOf(order.accepted_at) === timeOf(planned.timeline.accepted_at)

export async function placedOrders(
  container: MedusaContainer,
  restaurant_ids: string[],
) {
  const operations = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { restaurant_id: restaurant_ids },
      { select: ["order_id", "placed_at", "accepted_at"], take: null },
    )
  const recorded = new Map(
    operations.map(({ order_id, placed_at, accepted_at }) => [
      order_id,
      { placed_at, accepted_at },
    ]),
  )
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const placed: Placed[] = []
  const ids = operations.map(({ order_id }) => order_id)
  for (let start = 0; start < ids.length; start += 1000) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: ids.slice(start, start + 1000) },
    })
    for (const { id, metadata } of data as {
      id: string
      metadata?: Record<string, unknown> | null
    }[]) {
      const slot = metadata?.[DEMO_WORLD_KEY]
      if (typeof slot === "string")
        placed.push({ order_id: id, slot, ...recorded.get(id)! })
    }
  }
  return placed
}

/**
 * History Orders already finished: their finance receipt records their
 * planned moment, the last step of seeding one, and their placement and
 * acceptance are the planned ones. Any other seeded history
 * Order was left by an interrupted run; "now" Orders are never discarded.
 */
export async function finishedOrders(
  container: MedusaContainer,
  plan: DemoWorldPlan,
  placed: Placed[],
) {
  const history = placed.filter(({ slot }) => !slot.startsWith(NOW_SLOT_PREFIX))
  const recorded = await receiptMoments(
    container,
    history.map(({ order_id }) => order_id),
  )
  const bySlot = new Map(plan.orders.map((order) => [order.slot, order]))
  const firstDay = copenhagenDateOf(plan.from)
  const finished = new Set<string>()
  const unfinished: string[] = []
  for (const order of history) {
    const planned = bySlot.get(order.slot)
    const isKept =
      !finished.has(order.slot) &&
      (planned
        ? recorded.get(order.order_id) ===
            qualifyingMoment(planned).getTime() && isOnPlan(order, planned)
        : // A day before the window is kept as it is; inside the window, a
          // slot the plan does not have belongs to an earlier plan.
          order.slot.slice(0, 10) < firstDay)
    if (isKept) finished.add(order.slot)
    else unfinished.push(order.order_id)
  }
  return { finished, unfinished }
}

/** When finance recognized each Order, by Order id. */
async function receiptMoments(container: MedusaContainer, order_ids: string[]) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const recorded = new Map<string, number>()
  for (let start = 0; start < order_ids.length; start += 1000) {
    const receipts = await finance.listFinanceReceipts(
      { order_id: order_ids.slice(start, start + 1000) },
      { select: ["order_id", "occurred_at"], take: null },
    )
    for (const { order_id, occurred_at } of receipts)
      if (order_id) recorded.set(order_id, new Date(occurred_at).getTime())
  }
  return recorded
}

const basketOf = (
  restaurant: SeededRestaurant,
  order: { basket: DemoWorldOrder["basket"] },
) => {
  const lines = order.basket
    .filter(({ dish }) => restaurant.dishes.has(dish))
    .map(({ dish, quantity }) => ({
      dish: restaurant.dishes.get(dish)!,
      quantity,
    }))
  return lines.length
    ? lines
    : [{ dish: [...restaurant.dishes.values()][0], quantity: 1 }]
}

async function placeOrder(
  context: Context,
  order: Pick<DemoWorldOrder, "restaurant" | "customer" | "basket" | "slot">,
) {
  const restaurant = context.restaurants.get(order.restaurant)!
  const customer = context.customers.get(order.customer)!
  const basket = basketOf(restaurant, order)
  return placeDemoPaidOrder(context.container, {
    region_id: context.region_id,
    customer,
    dish: basket[0].dish,
    basket,
    postal_code: customer.postal_code,
    street: { address_1: customer.address_1, city: customer.city },
    metadata: { [DEMO_WORLD_KEY]: order.slot },
  })
}

/** The planned agent, or the next one along when that agent is busy. */
function freeAgent(context: Context, index: number) {
  for (let step = 0; step < context.agents.length; step++) {
    const id = context.agents[(index + step) % context.agents.length]
    if (!context.busy.has(id)) return id
  }
  throw refuse(MedusaError.Types.CONFLICT, "Every Delivery agent is busy")
}

/** Agents whose claimed delivery has not ended. */
async function busyAgents(container: MedusaContainer, agents: string[]) {
  const open = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { assigned_agent_id: agents, terminal_outcome: null },
      { select: ["assigned_agent_id"], take: null },
    )
  return new Set(open.map(({ assigned_agent_id }) => assigned_agent_id!))
}

function runs(
  context: Context,
  restaurant: SeededRestaurant,
  order_id: string,
  agent: number,
) {
  const agent_id = freeAgent(context, agent)
  return {
    agent_id,
    staff: { input: { staff_id: restaurant.staff_id, order_id } },
    agent: (step: string) => ({
      input: {
        order_id,
        agent_id,
        request_id: `${DEMO_WORLD_KEY}-${order_id}-${step}`,
      },
    }),
  }
}

/** Runs a history Order through the real workflows to its planned outcome. */
async function driveOutcome(
  context: Context,
  planned: DemoWorldOrder,
  order_id: string,
) {
  const { container } = context
  const restaurant = context.restaurants.get(planned.restaurant)!
  const customer = context.customers.get(planned.customer)!
  const { staff, agent } = runs(context, restaurant, order_id, planned.agent)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  switch (planned.outcome) {
    case "customer_cancelled":
      await cancelCustomerOrderWorkflow(container).run({
        input: { customer_id: customer.id, order_id },
      })
      return
    case "restaurant_rejected":
      await rejectPartnerOrderWorkflow(container).run({
        input: { ...staff.input, note: planned.note ?? null },
      })
      return
    case "acceptance_timeout": {
      // The recovery sweep's own expiry, for this Order only.
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
  await acceptPartnerOrderWorkflow(container).run(staff)
  if (planned.timeline.claimed_at)
    await claimDeliveryWorkflow(container).run(agent("claim"))
  await startPartnerOrderPreparationWorkflow(container).run(staff)
  if (planned.outcome === "unassigned_timeout") {
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
  if (planned.timeline.ready_at)
    await markPartnerOrderReadyWorkflow(container).run(staff)
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
  await confirmPickupWorkflow(container).run(agent("pickup"))
  await confirmHandoverWorkflow(container).run(agent("handover"))
  if (planned.rating)
    await submitFeedbackWorkflow(container).run({
      input: {
        order_id,
        customer_id: customer.id,
        ratings: {
          food_rating: planned.rating.food_rating,
          experience_rating: planned.rating.experience_rating,
          agent_rating: planned.rating.agent_rating,
        },
      },
    })
}

/**
 * The Feedback's handover and given times follow the retimed Order. The
 * generated update omits `created_at` from its type but writes it.
 */
async function retimeFeedback(
  container: MedusaContainer,
  planned: DemoWorldOrder,
  order_id: string,
) {
  if (!planned.rating) return
  const feedback = container.resolve<FeedbackModuleService>(FEEDBACK_MODULE)
  const [recorded] = await feedback.listFeedbacks({ order_id })
  if (!recorded) return
  await feedback.updateFeedbacks({
    id: recorded.id,
    delivered_at: planned.timeline.handed_over_at,
    created_at: planned.rating.rated_at,
  } as unknown as Parameters<typeof feedback.updateFeedbacks>[0])
}

/**
 * A legacy Order has no placement time, as Orders placed before placements
 * were recorded; a missing pickup time is a delivery recorded without one.
 * Only this seed writes them, on its own delivered Orders.
 */
async function ageRecord(
  container: MedusaContainer,
  planned: DemoWorldOrder,
  order_id: string,
) {
  if (planned.legacy) {
    const operations = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const [operation] = await operations.listOrderOperations({ order_id })
    await operations.updateOrderOperations({
      id: operation.id,
      placed_at: null,
      acceptance_deadline: null,
    } as unknown as Parameters<typeof operations.updateOrderOperations>[0])
  }
  if (planned.missing_pickup) {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [intended] = await delivery.listIntendedDeliveries({ order_id })
    await delivery.updateIntendedDeliveries({
      id: intended.id,
      picked_up_at: null,
    } as unknown as Parameters<typeof delivery.updateIntendedDeliveries>[0])
  }
}

async function seedHistoryOrder(context: Context, planned: DemoWorldOrder) {
  const { container } = context
  const order = await placeOrder(context, planned)
  await driveOutcome(context, planned, order.id)
  await retimeOrder(container, planned, order.id, retimerNearest)
  await retimeFeedback(container, planned, order.id)
  await recognizeAtPlannedTime(container, planned, order.id)
  await ageRecord(container, planned, order.id)
}

/** Runs `work` while this process's payment provider refuses refunds. */
async function withRefundsUnavailable<T>(
  container: MedusaContainer,
  work: () => Promise<T>,
) {
  const payment = container.resolve(Modules.PAYMENT)
  const refundPayment = payment.refundPayment
  payment.refundPayment = async () => {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "The payment provider did not respond",
    )
  }
  try {
    return await work()
  } finally {
    payment.refundPayment = refundPayment
  }
}

/**
 * Runs `work` while this process cannot take the Order's settlement lock, as
 * when a refund is still on its way: the refund stays pending until the
 * backend's recovery sweep settles it.
 */
async function withSettlementDelayed<T>(
  container: MedusaContainer,
  order_id: string,
  work: () => Promise<T>,
) {
  const locking = container.resolve(Modules.LOCKING)
  const execute = locking.execute.bind(locking)
  const key = orderSettlementLock(order_id).key
  locking.execute = (async (keys: string | string[], ...rest: unknown[]) => {
    if ([keys].flat().includes(key))
      throw new MedusaError(MedusaError.Types.CONFLICT, "Settlement is busy")
    return (execute as (...args: unknown[]) => unknown)(keys, ...rest)
  }) as typeof locking.execute
  try {
    return await work()
  } finally {
    locking.execute = execute
  }
}

/**
 * Retiming moves an attention deadline along with the milestones around it;
 * a deadline set from a milestone follows that milestone's rule instead, so
 * a delivery accepted fourteen minutes ago is due for attention now.
 */
async function rescheduleAttention(
  container: MedusaContainer,
  order_id: string,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [intended] = await delivery.listIntendedDeliveries(
    { order_id },
    { take: 1, select: ["accepted_at", "picked_up_at"] },
  )
  if (!intended) return
  for (const attention of await delivery.listDeliveryAttentions({ order_id })) {
    if (attention.raised_at) continue
    let due_at: Date | null = null
    if (attention.type === "unassigned")
      due_at = unassignedAttentionDueAt(intended.accepted_at)
    if (attention.type === "assigned_without_pickup")
      due_at = stalledAttentionDueAt(intended.accepted_at)
    if (
      attention.type === "in_transit_without_delivery" &&
      intended.picked_up_at
    )
      due_at = stalledAttentionDueAt(intended.picked_up_at)
    if (due_at)
      await delivery.updateDeliveryAttentions({ id: attention.id, due_at })
  }
}

/** One "now" Order, stopped at its planned stage, then moved to its times. */
async function seedNowOrder(context: Context, planned: DemoWorldNowOrder) {
  const { container } = context
  const restaurant = context.restaurants.get(planned.restaurant)!
  const customer = context.customers.get(planned.customer)!
  const order = await placeOrder(context, planned)
  const { staff, agent, agent_id } = runs(
    context,
    restaurant,
    order.id,
    planned.agent,
  )
  const { timeline, kind } = planned
  // An agent who claims a "now" delivery keeps it open after this run.
  if (timeline.claimed_at) context.busy.add(agent_id)
  if (kind === "failed_refund")
    await withRefundsUnavailable(container, () =>
      rejectPartnerOrderWorkflow(container).run({
        input: { ...staff.input, note: planned.note ?? null },
      }),
    )
  else if (kind === "pending_refund")
    await withSettlementDelayed(container, order.id, () =>
      cancelCustomerOrderWorkflow(container).run({
        input: { customer_id: customer.id, order_id: order.id },
      }),
    )
  else if (timeline.accepted_at) {
    await acceptPartnerOrderWorkflow(container).run(staff)
    if (timeline.claimed_at)
      await claimDeliveryWorkflow(container).run(agent("claim"))
    await startPartnerOrderPreparationWorkflow(container).run(staff)
    if (timeline.ready_at)
      await markPartnerOrderReadyWorkflow(container).run(staff)
    if (timeline.picked_up_at)
      await confirmPickupWorkflow(container).run(agent("pickup"))
    if (kind === "reported_problem")
      await reportDeliveryProblemWorkflow(container).run({
        input: {
          order_id: order.id,
          agent_id,
          category: "address_not_found",
          note: "Kunden svarer ikke, og opgangen er låst",
        },
      })
  }
  const outcome = planned.outcome ?? "open"
  await retimeOrder(container, { outcome, timeline }, order.id, retimerNearest)
  await rescheduleAttention(container, order.id)
  if (planned.outcome)
    await recognizeAtPlannedTime(
      container,
      { outcome: planned.outcome, timeline },
      order.id,
    )
  return order
}

/**
 * Once the history is complete: participation and the ended months. A
 * Restaurant is created a few days before the window, so its statements
 * start the month before; that month's fee accrues too, or every later
 * month waits for it.
 */
async function finalizeRestaurants(context: Context) {
  const { container, plan } = context
  for (const restaurant of context.restaurants.values()) {
    const planned = plan.restaurants.find(
      ({ key }) => key === restaurant.plan.key,
    )!
    await moveParticipation(container, restaurant.id, planned)
    const now = new Date()
    await closeSeededMonths(container, restaurant.id, {
      created_at: planned.created_at,
      months: statementMonths(planned.created_at, now).reverse(),
      now,
    })
  }
}

/**
 * Delivers the "now" Orders of earlier runs whose agent still holds them, so
 * their agents are free again. An agent carries one delivery at a time, so
 * otherwise every rerun takes a few more agents out of the history and the
 * new "now", and a later run finds every agent busy.
 */
async function deliverEarlierNow(context: Context, placed: Placed[]) {
  const { container } = context
  const order_ids = placed
    .filter(({ slot }) => slot.startsWith(NOW_SLOT_PREFIX))
    .map(({ order_id }) => order_id)
  if (!order_ids.length) return 0
  const held = (
    await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { order_id: order_ids, terminal_outcome: null },
        {
          select: [
            "order_id",
            "restaurant_id",
            "assigned_agent_id",
            "picked_up_at",
          ],
          take: null,
        },
      )
  ).filter(({ assigned_agent_id }) => assigned_agent_id)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const staffOf = new Map(
    [...context.restaurants.values()].map(({ id, staff_id }) => [id, staff_id]),
  )
  for (const {
    order_id,
    restaurant_id,
    assigned_agent_id,
    picked_up_at,
  } of held) {
    const agent = (step: string) => ({
      input: {
        order_id,
        agent_id: assigned_agent_id!,
        request_id: `${DEMO_WORLD_KEY}-${order_id}-later-${step}`,
      },
    })
    const [operation] = await operations.listOrderOperations(
      { order_id },
      { take: 1, select: ["state"] },
    )
    if (operation?.state === "preparing")
      await markPartnerOrderReadyWorkflow(container).run({
        input: { staff_id: staffOf.get(restaurant_id)!, order_id },
      })
    if (!picked_up_at)
      await confirmPickupWorkflow(container).run(agent("pickup"))
    await confirmHandoverWorkflow(container).run(agent("handover"))
  }
  return held.length
}

export default async function seedDemoWorld({ container }: ExecArgs) {
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
  const options = settings()
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  if (!region)
    throw refuse(
      MedusaError.Types.NOT_FOUND,
      "No DKK region; run the backend migrations first",
    )
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const started = Date.now()
  const now = new Date()
  const plan = planDemoWorld({
    now,
    email_domain: options.domain,
    scale: options.scale,
  })
  const operatorEmail = `${asciiOf(OPERATOR.first_name)}.${asciiOf(OPERATOR.last_name)}@${options.domain}`
  const operator_id = await demoOperator(
    container,
    operatorEmail,
    options.password,
  )

  const declare = await declarationsFor(container)
  const restaurants = new Map<string, SeededRestaurant>()
  for (const planned of DEMO_WORLD_RESTAURANTS) {
    restaurants.set(
      planned.key,
      await demoRestaurant(
        { container, operator_id, plan },
        planned,
        options,
        declare,
      ),
    )
    logger.info(`Demo world: ${planned.name} ready`)
  }
  const context: Context = {
    container,
    plan,
    region_id: region.id,
    operator_id,
    restaurants,
    customers: await demoCustomers(container, plan.customers, options.password),
    agents: await demoAgents(container, plan, operator_id, options.password),
    busy: new Set(),
  }
  logger.info(
    `Demo world: ${plan.customers.length} Customers and ${plan.agents.length} Delivery agents ready`,
  )

  const placed = await placedOrders(
    container,
    [...restaurants.values()].map(({ id }) => id),
  )
  const delivered = await deliverEarlierNow(context, placed)
  if (delivered)
    logger.info(
      `Demo world: delivered ${delivered} "now" Orders of earlier runs to free their agents`,
    )
  context.busy = await busyAgents(container, context.agents)
  const { finished, unfinished } = await finishedOrders(container, plan, placed)
  if (unfinished.length) {
    logger.info(
      `Demo world: discarding ${unfinished.length} unfinished Orders of an interrupted run`,
    )
    await discardOrders(container, unfinished)
  }
  const missing = plan.orders.filter(({ slot }) => !finished.has(slot))
  const batch = missing.slice(0, options.max)
  logger.info(
    `Demo world: ${plan.orders.length} history Orders planned, ${finished.size} already seeded, creating ${batch.length}`,
  )
  // Workers run side by side, each with its own agents: an agent carries
  // one delivery at a time, so two workers never need the same one.
  const queues: DemoWorldOrder[][] = Array.from(
    { length: options.workers },
    () => [],
  )
  for (const planned of batch) {
    const agent = context.agents.indexOf(freeAgent(context, planned.agent))
    queues[agent % options.workers].push(planned)
  }
  const historyStarted = Date.now()
  let done = 0
  await Promise.all(
    queues.map(async (queue) => {
      for (const planned of queue) {
        await seedHistoryOrder(context, planned)
        done++
        if (done % 100 === 0 || done === batch.length) {
          const perOrder = (Date.now() - historyStarted) / done
          const left = Math.round(((batch.length - done) * perOrder) / 60000)
          logger.info(
            `Demo world: ${done} of ${batch.length} Orders (${Math.round(perOrder)} ms each with ${options.workers} workers, about ${left} min left)`,
          )
        }
      }
    }),
  )
  const complete = batch.length === missing.length
  if (complete) await finalizeRestaurants(context)
  else
    logger.info(
      `Demo world: stopped after ${batch.length} Orders (DEMO_WORLD_MAX_ORDERS); run again to continue. Months close once the history is complete.`,
    )

  const nowOrders = new Map<string, number>()
  // Planned again now, after the history, so its minutes are current.
  for (const planned of planNowOrders(new Date(), plan.customers, plan.agents))
    nowOrders.set(
      planned.kind,
      (await seedNowOrder(context, planned)).display_id,
    )
  const { result: attention } = await recoverDeliveryAttentionWorkflow(
    container,
  ).run({
    input: {},
  })

  // Who shows what; neither the password nor a Customer's email is printed.
  const scarpetta = restaurants.get("scarpetta")!
  const primes = [...restaurants.values()].filter(({ plan }) => plan.prime)
  const order = (kind: string) => `#${nowOrders.get(kind)}`
  logger.info(
    [
      `Demo world seeded in ${Math.round((Date.now() - started) / 60000)} min: ${restaurants.size} Restaurants, ${plan.customers.length} Customers, ${plan.agents.length} agents, ${finished.size + batch.length} history Orders${complete ? "" : " (incomplete)"}; ${attention.raised} attention items raised.`,
      "Every seeded login uses DEMO_WORLD_PASSWORD:",
      `  Admin (operations, refunds, deliveries, statements): ${operatorEmail}`,
      ...primes.map(
        ({ plan, staff_email }) =>
          `  Partner app, ${plan.name}: ${staff_email}`,
      ),
      `  Delivery agents, for example: ${plan.agents
        .slice(0, 3)
        .map(({ email }) => email)
        .join(", ")}`,
      "  Customers: any seeded Customer; find one under Customers in the Admin.",
      `Now at ${scarpetta.plan.name}: ${order("awaiting_acceptance")} awaits acceptance, ${order("ready_unassigned_waiting")} is ready with no agent for over ten minutes, ${order("pending_refund")} has a pending Full refund.`,
      `Failed Full refund: ${order("failed_refund")}. Reported delivery problem: ${order("reported_problem")}.`,
    ].join("\n"),
  )
}
