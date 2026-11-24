/**
 * Demo Orders for the partner Order page's "Purchased financial terms"
 * (#226), in a local or disposable environment. Each Order is placed through
 * the real cart, mock payment and completion workflows, so its financial
 * basis is recorded exactly as a storefront checkout records it. Run from
 * apps/backend:
 *
 *   npx medusa exec ./src/scripts/seed-demo-financial-basis.ts
 *
 * It uses the first active, open Restaurant with a published dish and an
 * authorized staff member, so sign in to the partner app as that staff
 * member to see them. Optional: DEMO_FINANCIAL_RESTAURANT_ID picks the
 * Restaurant and DEMO_FINANCIAL_CUSTOMER_EMAIL an existing Customer account;
 * without it a synthetic Customer is created once and reused. Every run adds
 * a new set. The basis shows only while MTOGO_FF_RESTAURANT_STATEMENTS=true.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import {
  placeDemoPaidOrder,
  type DemoBasketLine,
  type DemoDish,
} from "../lib/demo-paid-order"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"

const SYNTHETIC_CUSTOMER = {
  email: "sofie.lund.demo@example.test",
  first_name: "Sofie",
  last_name: "Lund",
  phone: "+4528193746",
}

/** An active, open Restaurant with published dishes and authorized staff. */
async function demoRestaurant(container: MedusaContainer) {
  const { data: staff } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "restaurant_staff",
      fields: ["id", "restaurant_id"],
      filters: { status: "authorized" },
    })
  const wanted = process.env.DEMO_FINANCIAL_RESTAURANT_ID
  const candidates = [
    ...new Set(
      (staff as { restaurant_id: string }[])
        .map(({ restaurant_id }) => restaurant_id)
        .filter((id) => !wanted || id === wanted),
    ),
  ]
  for (const id of candidates) {
    const found = await readRestaurantWithMenu(container, id)
    const dishes = (
      found?.menu.flatMap((category) => category.dishes) ?? []
    ).filter(({ is_sold_out }) => !is_sold_out)
    const postalCode = found?.restaurant.delivery_area_postal_codes?.[0]
    if (!found?.restaurant.is_active || !found.restaurant.is_open) continue
    if (!dishes.length || !postalCode) continue
    return {
      name: found.restaurant.name,
      dishes: dishes as DemoDish[],
      postalCode: postalCode.postal_code,
    }
  }
  throw new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "No active, open Restaurant with a published dish and authorized staff" +
      (wanted ? ` matches ${wanted}` : ""),
  )
}

/** The named Customer account, or the synthetic demo Customer, created once. */
async function demoCustomer(container: MedusaContainer) {
  const email =
    process.env.DEMO_FINANCIAL_CUSTOMER_EMAIL || SYNTHETIC_CUSTOMER.email
  const [existing] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email, has_account: true })
  if (existing) return existing
  if (process.env.DEMO_FINANCIAL_CUSTOMER_EMAIL)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No Customer account for ${email}`,
    )
  const {
    result: [created],
  } = await createCustomersWorkflow(container).run({
    input: { customersData: [{ ...SYNTHETIC_CUSTOMER, has_account: true }] },
  })
  return created
}

/** Varied baskets from the menu: a single dish, a doubled one, a family order. */
function demoBaskets(dishes: DemoDish[]) {
  const dish = (index: number) => dishes[index % dishes.length]
  return [
    { shows: "one dish", basket: [{ dish: dish(0), quantity: 1 }] },
    { shows: "two of one dish", basket: [{ dish: dish(1), quantity: 2 }] },
    {
      shows: "a family order of several dishes",
      basket: [
        { dish: dish(0), quantity: 2 },
        { dish: dish(1), quantity: 1 },
        { dish: dish(2), quantity: 3 },
      ],
    },
  ] satisfies { shows: string; basket: DemoBasketLine[] }[]
}

export default async function seedDemoFinancialBasis({ container }: ExecArgs) {
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
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  if (!region)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No DKK region; run the backend migrations first",
    )
  const restaurant = await demoRestaurant(container)
  const customer = await demoCustomer(container)
  const place = (basket: DemoBasketLine[]) =>
    placeDemoPaidOrder(container, {
      region_id: region.id,
      customer,
      dish: basket[0].dish,
      basket,
      postal_code: restaurant.postalCode,
      metadata: { demo_financial_basis_226: true },
    })

  const created: { number: number; shows: string }[] = []
  for (const { shows, basket } of demoBaskets(restaurant.dishes)) {
    const order = await place(basket)
    created.push({ number: order.display_id, shows })
  }
  // Demo only: an Order as if placed before #226, which shows its basis as
  // unavailable instead of guessing from today's menu.
  const legacy = await place([{ dish: restaurant.dishes[0], quantity: 1 }])
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [record] = await operations.listOrderOperations({
    order_id: legacy.id,
  })
  await operations.updateOrderOperations({
    id: record.id,
    financial_basis: null,
  })
  created.push({
    number: legacy.display_id,
    shows: "placed before #226: basis unavailable",
  })

  console.log(`Demo financial basis Orders at ${restaurant.name}:`)
  for (const { number, shows } of created) console.log(`  #${number}  ${shows}`)
}
