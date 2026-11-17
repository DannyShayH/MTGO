import type { MedusaContainer } from "@medusajs/framework/types"
import { configureOperatorSidebarWorkflow } from "../workflows/operator-sidebar"

/** Navigation preference only: Inventory routes, APIs and commerce modules stay enabled. */
export default async function operator_sidebar({
  container,
}: {
  container: MedusaContainer
}) {
  await configureOperatorSidebarWorkflow(container).run({ input: undefined })
}
