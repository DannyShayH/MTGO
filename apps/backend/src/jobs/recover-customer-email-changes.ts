import type { MedusaContainer } from "@medusajs/framework/types"
import { recoverCustomerEmailChangesWorkflow } from "../workflows/customer-auth/recover-customer-email-changes"

export default async function recoverCustomerEmailChanges(
  container: MedusaContainer,
) {
  await recoverCustomerEmailChangesWorkflow(container).run()
}

export const config = {
  name: "recover-customer-email-changes",
  schedule: "* * * * *",
}
