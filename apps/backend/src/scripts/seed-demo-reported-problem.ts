/**
 * One accepted Order whose responsible Delivery agent reported a problem
 * (#199), so it is in the Admin Deliveries page's attention list and an
 * operator can try Cancel with full refund in a disposable or local
 * environment. It creates its own active, open Restaurant and Customer,
 * places a paid Order through the real checkout workflows, has the staff
 * accept it, an authorized agent claim it and report that the Restaurant is
 * closed. Run from apps/backend:
 *
 *   npx medusa exec ./src/scripts/seed-demo-reported-problem.ts [run-id]
 *
 * Every run adds a new Restaurant, agent and Order. It prints one JSON line
 * with `order_id`, `order_reference` and `restaurant_name`.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { placeDemoPaidOrder } from "../lib/demo-paid-order"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { claimDeliveryWorkflow } from "../workflows/delivery/assignment"
import { reportDeliveryProblemWorkflow } from "../workflows/delivery/problem-report"
import { acceptPartnerOrderWorkflow } from "../workflows/order-operations"
import { demoRestaurant } from "./seed-demo-failed-refund"

const POSTAL_CODE = "2200"

export default async function seedDemoReportedProblem({
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
  const restaurant = await demoRestaurant(container, runId, {
    label: "Problem demo kitchen",
  })
  const {
    result: [customer],
  } = await createCustomersWorkflow(container).run({
    input: {
      customersData: [
        {
          email: `problem-demo-customer-${runId}@example.test`,
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
    metadata: { demo_reported_problem_199: true },
  })
  await acceptPartnerOrderWorkflow(container).run({
    input: { staff_id: restaurant.staff_id, order_id: order.id },
  })
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const agent = await delivery.createDeliveryAgents({
    name: "Demo Agent",
    email: `problem-demo-agent-${runId}@example.test`,
    status: "authorized",
    invited_by: "system",
  })
  await delivery.createDeliveryAgentAreas({
    agent_id: agent.id,
    postal_code: POSTAL_CODE,
  })
  await claimDeliveryWorkflow(container).run({
    input: {
      order_id: order.id,
      agent_id: agent.id,
      request_id: `problem-demo-claim-${runId}`,
    },
  })
  await reportDeliveryProblemWorkflow(container).run({
    input: {
      order_id: order.id,
      agent_id: agent.id,
      category: "restaurant_unavailable",
      note: "Demo: the Restaurant is closed",
    },
  })
  // The fixture line is the script's output, which the Admin browser journey
  // parses from stdout; the logger would prefix it, so it is written raw.
  process.stdout.write(
    `${JSON.stringify({
      order_id: order.id,
      order_reference: order.display_id,
      restaurant_name: restaurant.name,
    })}\n`,
  )
}
