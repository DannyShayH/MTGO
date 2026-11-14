import { MedusaContainer } from "@medusajs/framework"
import { ensureMenuCommerceSetupWorkflow } from "../workflows/menu"

/** Normal application setup: the menu sales channel and tax-inclusive DKK prices. */
export default async function menu_commerce_setup({
  container,
}: {
  container: MedusaContainer
}) {
  await ensureMenuCommerceSetupWorkflow(container).run({ input: undefined })
}
