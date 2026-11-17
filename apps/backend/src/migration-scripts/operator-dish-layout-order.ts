import type { MedusaContainer } from "@medusajs/framework/types"
import { configureOperatorProductLayoutWorkflow } from "../workflows/operator-sidebar"

/** Layout Composer namespaces authored widget IDs with `widget:` in saved preferences. */
export default async function operator_dish_layout_order({
  container,
}: {
  container: MedusaContainer
}) {
  await configureOperatorProductLayoutWorkflow(container).run({
    input: undefined,
  })
}
