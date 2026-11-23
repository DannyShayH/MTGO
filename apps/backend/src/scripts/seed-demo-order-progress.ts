/**
 * Demo Orders for the Customer's Order timeline (#147), one per stage, in a
 * disposable or local environment. Each Order is placed through the real
 * cart, mock payment and completion workflows, then moved on with the real
 * staff and Customer workflows, so its milestones and refund are recorded
 * facts. Run from apps/backend:
 *
 *   DEMO_PROGRESS_CUSTOMER_EMAIL=<email> npx medusa exec ./src/scripts/seed-demo-order-progress.ts
 *
 * Optional: DEMO_PROGRESS_RESTAURANT_ID picks the Restaurant. It must be
 * active, open, have a published dish and an authorized staff member. Every
 * run adds a new set. The awaiting Order expires after five minutes, as any
 * unanswered Order does, when the backend's recovery job runs.
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { placeDemoPaidOrder } from "../lib/demo-paid-order"
import { readRestaurantWithMenu } from "../workflows/menu/steps/read-menu"
import {
  acceptPartnerOrderWorkflow,
  cancelCustomerOrderWorkflow,
  markPartnerOrderReadyWorkflow,
  rejectPartnerOrderWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../workflows/order-operations"

type Stage =
  | "awaiting"
  | "accepted"
  | "preparing"
  | "ready"
  | "customer_cancelled"
  | "rejected_refund_pending"
  | "rejected_refund_failed"

const STAGES: { stage: Stage; shows: string }[] = [
  { stage: "awaiting", shows: "placed; Cancel offered (expires in 5 min)" },
  { stage: "accepted", shows: "placed, accepted; preparing upcoming" },
  { stage: "preparing", shows: "placed, accepted, preparing now" },
  { stage: "ready", shows: "all four steps; ready now" },
  { stage: "customer_cancelled", shows: "cancelled by you; refund succeeded" },
  {
    stage: "rejected_refund_pending",
    shows: "rejected by Restaurant; refund pending",
  },
  {
    stage: "rejected_refund_failed",
    shows: "rejected by Restaurant; refund failed (owed)",
  },
]

const required = (value: unknown, message: string) => {
  if (!value) throw new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

/** An active, open Restaurant with a published dish and authorized staff. */
async function demoRestaurant(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: staff } = await query.graph({
    entity: "restaurant_staff",
    fields: ["id", "status", "restaurant_id"],
    filters: { status: "authorized" },
  })
  const wanted = process.env.DEMO_PROGRESS_RESTAURANT_ID
  const candidates = [
    ...new Set(
      (staff as { restaurant_id: string }[])
        .map(({ restaurant_id }) => restaurant_id)
        .filter((id) => !wanted || id === wanted),
    ),
  ]
  for (const id of candidates) {
    const found = await readRestaurantWithMenu(container, id)
    const dish = found?.menu
      .flatMap(({ dishes }) => dishes)
      .find(({ is_sold_out }) => !is_sold_out)
    const postalCode = found?.restaurant.delivery_area_postal_codes?.[0]
    if (!found?.restaurant.is_active || !found.restaurant.is_open) continue
    if (!dish || !postalCode) continue
    const staffId = (staff as { id: string; restaurant_id: string }[]).find(
      ({ restaurant_id }) => restaurant_id === id,
    )!.id
    return {
      id,
      name: found.restaurant.name,
      dish,
      postalCode: postalCode.postal_code,
      staffId,
    }
  }
  throw new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "No active, open Restaurant with a published dish and authorized staff" +
      (wanted ? ` matches ${wanted}` : ""),
  )
}

export default async function seedDemoOrderProgress({ container }: ExecArgs) {
  const email = process.env.DEMO_PROGRESS_CUSTOMER_EMAIL
  required(email, "Set DEMO_PROGRESS_CUSTOMER_EMAIL to a Customer account")
  const [customer] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email, has_account: true })
  required(customer, `No Customer account for ${email}`)
  const [region] = await container
    .resolve(Modules.REGION)
    .listRegions({ currency_code: "dkk" })
  required(region, "No DKK region; run the backend migrations first")
  const restaurant = await demoRestaurant(container)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )

  /** The Customer's whole paid checkout, through the same workflows. */
  const placePaidOrder = () =>
    placeDemoPaidOrder(container, {
      region_id: region.id,
      customer,
      dish: restaurant.dish,
      postal_code: restaurant.postalCode,
      metadata: { demo_order_progress_147: true },
    })

  const staff = (order_id: string) => ({
    input: { staff_id: restaurant.staffId, order_id },
  })
  const setRefund = async (order_id: string, status: "pending" | "failed") => {
    const [obligation] = await operations.listRefundObligations({ order_id })
    // Demo only: show the outcome a stalled or declined refund would leave.
    await operations.updateRefundObligations({
      id: obligation.id,
      status,
      succeeded_at: null,
      failure_code: status === "failed" ? "refund_provider_failed" : null,
    })
  }

  const created: { number: number; shows: string }[] = []
  for (const { stage, shows } of STAGES) {
    const order = await placePaidOrder()
    if (["accepted", "preparing", "ready"].includes(stage))
      await acceptPartnerOrderWorkflow(container).run(staff(order.id))
    if (["preparing", "ready"].includes(stage))
      await startPartnerOrderPreparationWorkflow(container).run(staff(order.id))
    if (stage === "ready")
      await markPartnerOrderReadyWorkflow(container).run(staff(order.id))
    if (stage === "customer_cancelled")
      await cancelCustomerOrderWorkflow(container).run({
        input: { customer_id: customer.id, order_id: order.id },
      })
    if (stage.startsWith("rejected")) {
      await rejectPartnerOrderWorkflow(container).run({
        input: {
          staff_id: restaurant.staffId,
          order_id: order.id,
          note: "Demo: ovnen er gået i stykker",
        },
      })
      await setRefund(
        order.id,
        stage === "rejected_refund_pending" ? "pending" : "failed",
      )
    }
    created.push({ number: order.display_id, shows })
  }

  console.log(
    `Demo Order timeline for ${customer.email} at ${restaurant.name}:`,
  )
  for (const { number, shows } of created) console.log(`  #${number}  ${shows}`)
}
