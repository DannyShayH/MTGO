import { MedusaContainer } from "@medusajs/framework/types"
import { recordLegacyPlacementsWorkflow } from "../workflows/order-operations"

/** Orders placed before Order Operations existed stay readable by their Restaurant's staff. */
export default async function legacy_order_placements({
  container,
}: {
  container: MedusaContainer
}) {
  await recordLegacyPlacementsWorkflow(container).run({ input: undefined })
}
