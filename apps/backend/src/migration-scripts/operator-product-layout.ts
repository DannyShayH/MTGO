import type { MedusaContainer } from "@medusajs/framework/types"
import { configureOperatorProductLayoutWorkflow } from "../workflows/operator-sidebar"

/** New migration for installations that already applied the operator sidebar default. */
export default async function operator_product_layout({
  container,
}: {
  container: MedusaContainer
}) {
  await configureOperatorProductLayoutWorkflow(container).run({
    input: undefined,
  })
}
