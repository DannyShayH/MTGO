/**
 * One Order whose Full refund failed at the payment provider (#198), for the
 * Refunds page in a disposable or local environment. It creates its own
 * active, open Restaurant (menu, delivery area 2200, commercial terms,
 * authorized staff) and Customer, places a paid Order through the real
 * checkout workflows and has the Restaurant reject it while the payment
 * provider is unavailable, so the refund is owed as `failed` with the staff
 * member's failed attempt in its history. The outage exists only inside
 * this script's process: an operator's Retry on the running backend reaches
 * the working mock provider. Run from apps/backend:
 *
 *   npx medusa exec ./src/scripts/seed-demo-failed-refund.ts [run-id]
 *
 * Every run adds a new Restaurant and Order. It prints one JSON line with
 * `order_id`, `order_reference` and `restaurant_name`.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { placeDemoPaidOrder } from "../lib/demo-paid-order"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import { rejectPartnerOrderWorkflow } from "../workflows/order-operations"
import { SYSTEM_ACTOR } from "../workflows/order-operations/rules"
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
import seedDemoMenu from "./seed-demo-menu"

const POSTAL_CODE = "2200"

/** An active, open Restaurant of its own, with a menu and authorized staff. */
async function demoRestaurant(container: MedusaContainer, runId: string) {
  const name = `Refund demo kitchen ${runId}`
  const {
    result: { restaurant },
  } = await createRestaurantWorkflow(container).run({
    input: {
      name,
      address_street: `Refundvej ${runId}`,
      address_postal_code: POSTAL_CODE,
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "refund-demo@restaurant.example",
    },
  })
  const restaurant_id = restaurant.id
  await changeDeliveryAreaWorkflow(container).run({
    input: { restaurant_id, add: [POSTAL_CODE], remove: [] },
  })
  await recordCommercialTermsWorkflow(container).run({
    input: {
      restaurant_id,
      terms_version: COMMON_MVP_TERMS_V1.terms_version,
      recorded_by: SYSTEM_ACTOR,
    },
  })
  await seedDemoMenu({ container, args: [restaurant_id] } as ExecArgs)
  const email = `refund-demo-staff-${runId}@example.test`
  const [identity] = await container
    .resolve(Modules.AUTH)
    .createAuthIdentities([
      { provider_identities: [{ provider: "emailpass", entity_id: email }] },
    ])
  const {
    result: { id: staff_id },
  } = await createAuthorizedStaffWorkflow(container).run({
    input: {
      restaurant_id,
      name: "Demo Staff",
      email,
      auth_identity_id: identity.id,
    },
  })
  await activateRestaurantWorkflow(container).run({
    input: { restaurant_id, operator_id: SYSTEM_ACTOR },
  })
  await openRestaurantWorkflow(container).run({
    input: { restaurant_id, staff_id },
  })
  const dish = (await readRestaurantWithMenu(container, restaurant_id))?.menu
    .flatMap(({ dishes }) => dishes)
    .find(({ is_sold_out }) => !is_sold_out)
  if (!dish)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The demo menu has no orderable dish",
    )
  return { id: restaurant_id, name, staff_id, dish }
}

/**
 * Runs `work` while this process's payment module refuses every refund, as
 * an unavailable provider would. Only this process is affected.
 */
async function withRefundsUnavailable<T>(
  container: MedusaContainer,
  work: () => Promise<T>,
) {
  const payment = container.resolve(Modules.PAYMENT)
  const refundPayment = payment.refundPayment
  payment.refundPayment = async () => {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Demo: the payment provider is unavailable",
    )
  }
  try {
    return await work()
  } finally {
    payment.refundPayment = refundPayment
  }
}

export default async function seedDemoFailedRefund({
  container,
  args,
}: ExecArgs) {
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
  const runId = args?.[0] || Date.now().toString(36)
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  if (!region)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No DKK region; run the backend migrations first",
    )
  const restaurant = await demoRestaurant(container, runId)
  const {
    result: [customer],
  } = await createCustomersWorkflow(container).run({
    input: {
      customersData: [
        {
          email: `refund-demo-customer-${runId}@example.test`,
          first_name: "Demo",
          last_name: "Kunde",
          has_account: true,
        },
      ],
    },
  })
  const order = await placeDemoPaidOrder(container, {
    region_id: region.id,
    customer,
    dish: restaurant.dish,
    postal_code: POSTAL_CODE,
    metadata: { demo_failed_refund_198: true },
  })
  await withRefundsUnavailable(container, () =>
    rejectPartnerOrderWorkflow(container).run({
      input: {
        staff_id: restaurant.staff_id,
        order_id: order.id,
        note: "Demo: the oven broke down",
      },
    }),
  )
  console.log(
    JSON.stringify({
      order_id: order.id,
      order_reference: order.display_id,
      restaurant_name: restaurant.name,
    }),
  )
}
