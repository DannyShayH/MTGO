import { MedusaContainer } from "@medusajs/framework/types"
import { markRecordedPlacementsWorkflow } from "../workflows/order-operations"

/** Orders placed before #154 get the placement marker, so Order lists keep them. */
export default async function order_placement_markers({
  container,
}: {
  container: MedusaContainer
}) {
  await markRecordedPlacementsWorkflow(container).run({ input: undefined })
}
