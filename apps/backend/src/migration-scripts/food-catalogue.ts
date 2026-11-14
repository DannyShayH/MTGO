import { MedusaContainer } from "@medusajs/framework"
import { seedFoodCatalogueWorkflow } from "../workflows/food-catalogue"

/** Normal application reference data, independent of optional demo menus. */
export default async function food_catalogue({
  container,
}: {
  container: MedusaContainer
}) {
  await seedFoodCatalogueWorkflow(container).run({ input: undefined })
}
