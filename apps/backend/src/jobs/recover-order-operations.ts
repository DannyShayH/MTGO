import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverOrderOperationsWorkflow } from "../workflows/order-operations"

/**
 * Expires unanswered Orders and resumes pending cancellation and refund work
 * (#144). Each tick reads only durable records, so the first tick after a
 * worker starts is the startup reconciliation, and nothing depends on a
 * browser timer or a Redis event surviving.
 */
export default async function recoverOrderOperations(
  container: MedusaContainer,
) {
  await recoverOrderOperationsWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-order-operations",
  schedule: "* * * * *",
}
