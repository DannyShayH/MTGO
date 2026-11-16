import { MedusaContainer } from "@medusajs/framework"
import { ensureDenmarkRegionWorkflow } from "../workflows/regions/ensure-denmark-region"

/** Runs after the starter seed: Denmark gets a DKK region so dishes have a price. */
export default async function menu_denmark_region({
  container,
}: {
  container: MedusaContainer
}) {
  await ensureDenmarkRegionWorkflow(container).run({ input: undefined })
}
