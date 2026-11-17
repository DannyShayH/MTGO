import type { MedusaContainer } from "@medusajs/framework/types"
import { retireStarterMerchandiseWorkflow } from "../workflows/starter-cleanup"

/** Retire positively identified demo merchandise during upgrades and fresh setup. */
export default async function retire_starter_merchandise({
  container,
}: {
  container: MedusaContainer
}) {
  await retireStarterMerchandiseWorkflow(container).run({ input: undefined })
}
